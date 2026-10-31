"""Central incident flow: this is the heart of MOSSAM.

create_incident_flow() does, in order:
  1. Persist the incident.
  2. Find the affected route (given explicitly, or the vehicle's current
     route, or fall back to any active route near the incident).
  3. Recompute that route's hazard risk / reliability / score.
  4. Generate an alternative route (a fresh detour) with a lower score.
  5. Create an alert.
  6. Record a RouteDecision (with a human explanation) describing why.
  7. Bump impact stats.

Everything here uses plain SQLAlchemy calls against the passed-in session -
no hidden global state - so it's easy to unit test.
"""
import math
import random
import uuid
from typing import Optional

from sqlalchemy.orm import Session

from .. import models
from . import risk_engine
from .explanation_service import explain_route_decision

SEVERITY_TO_ALERT = {
    "low": "medium",
    "medium": "medium",
    "high": "high",
    "severe": "critical",
}


def _new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:6].upper()}"


def _offset_point(lat: float, lng: float, km: float, bearing_deg: float) -> tuple[float, float]:
    """Move a lat/lng point roughly `km` kilometers along `bearing_deg`.
    Simple planar approximation - plenty accurate for a demo detour path.
    """
    d_lat = (km / 111.0) * math.cos(math.radians(bearing_deg))
    d_lng = (km / (111.0 * math.cos(math.radians(lat)) or 1)) * math.sin(math.radians(bearing_deg))
    return lat + d_lat, lng + d_lng


def _find_affected_route(db: Session, incident: models.Incident, vehicle_id: Optional[str]) -> Optional[models.Route]:
    if incident.affected_route_id:
        r = db.get(models.Route, incident.affected_route_id)
        if r:
            return r
    if vehicle_id:
        vehicle = db.get(models.Vehicle, vehicle_id)
        if vehicle and vehicle.current_route_id:
            return db.get(models.Route, vehicle.current_route_id)
    # Fallback: nearest active route by rough distance to incident location.
    routes = db.query(models.Route).filter(models.Route.is_active == True).all()  # noqa: E712
    best, best_dist = None, None
    for r in routes:
        coords = r.coordinates
        if not coords:
            continue
        for lat, lng in coords:
            dist = (lat - incident.lat) ** 2 + (lng - incident.lng) ** 2
            if best_dist is None or dist < best_dist:
                best_dist, best = dist, r
    return best


def _generate_alternative_route(db: Session, base_route: models.Route, incident: models.Incident) -> models.Route:
    """Create a detour route: same endpoints, a slight geographic deviation,
    a modest time penalty, but meaningfully lower hazard risk/reliability
    penalty than the (now hazardous) base route.
    """
    coords = base_route.coordinates or [[incident.lat, incident.lng]]
    start = coords[0]
    end = coords[-1]
    mid_idx = len(coords) // 2
    mid_lat, mid_lng = coords[mid_idx]
    # Nudge the midpoint away from the incident to represent a detour.
    bearing = random.choice([45, 135, 225, 315])
    detour_lat, detour_lng = _offset_point(mid_lat, mid_lng, km=12, bearing_deg=bearing)

    new_coords = [start, [detour_lat, detour_lng], end]
    extra_distance = round(base_route.distance_km * 0.12 + 6, 1)
    extra_time = round(base_route.travel_time_hours * 0.15 + 0.3, 2)

    alt_route = models.Route(
        id=_new_id("RT"),
        vehicle_id=base_route.vehicle_id,
        name=f"{base_route.name} - Alt via Detour",
        origin_name=base_route.origin_name,
        destination_name=base_route.destination_name,
        distance_km=base_route.distance_km + extra_distance,
        travel_time_hours=base_route.travel_time_hours + extra_time,
        hazard_risk=max(5.0, base_route.hazard_risk - 45),
        reliability_penalty=max(5.0, base_route.reliability_penalty - 30),
        is_active=True,
        is_ai_recommended=True,
    )
    alt_score = risk_engine.compute_score(
        alt_route.travel_time_hours, alt_route.hazard_risk, alt_route.reliability_penalty
    )
    alt_route.score = alt_score.score
    alt_route.coordinates = new_coords
    db.add(alt_route)
    return alt_route


def create_incident_flow(
    db: Session,
    incident_in,
    vehicle_id: Optional[str] = None,
    use_ollama: bool = False,
):
    """Run the full incident -> risk -> reroute -> alert -> impact pipeline.
    Returns a dict matching schemas.IncidentResponse's shape (as ORM/plain
    objects; the route layer converts to Pydantic).
    """
    # 1. Persist incident
    incident = models.Incident(
        id=_new_id("INC"),
        type=incident_in.type,
        severity=incident_in.severity,
        lat=incident_in.lat,
        lng=incident_in.lng,
        description=incident_in.description,
        affected_route_id=incident_in.affected_route_id,
        source=incident_in.source,
        status="active",
    )
    db.add(incident)
    db.flush()

    # 2. Find affected route
    route = _find_affected_route(db, incident, vehicle_id)

    updated_route = None
    alternative_route = None
    decision = None
    alert = None

    if route:
        old_score = risk_engine.compute_score(route.travel_time_hours, route.hazard_risk, route.reliability_penalty)

        # 3. Update route risk from the incident
        new_risk, new_reliability = risk_engine.apply_incident_to_risk(
            route.hazard_risk, route.reliability_penalty, incident.type, incident.severity
        )
        route.hazard_risk = new_risk
        route.reliability_penalty = new_reliability
        new_score = risk_engine.compute_score(route.travel_time_hours, new_risk, new_reliability)
        route.score = new_score.score
        route.is_ai_recommended = False
        updated_route = route

        # 4. Generate alternative route
        alternative_route = _generate_alternative_route(db, route, incident)

        eta_delta = round(alternative_route.travel_time_hours - route.travel_time_hours, 2)
        risk_reduction_pct = 0.0
        if route.hazard_risk > 0:
            risk_reduction_pct = max(
                0.0, round(((route.hazard_risk - alternative_route.hazard_risk) / route.hazard_risk) * 100, 1)
            )

        explanation_text = explain_route_decision(
            incident.type, incident.severity, old_score, new_score, eta_delta, risk_reduction_pct, use_ollama
        )

        # 6. Record the decision (why the route changed)
        decision = models.RouteDecision(
            vehicle_id=route.vehicle_id,
            incident_id=incident.id,
            old_route_id=route.id,
            new_route_id=alternative_route.id,
            old_score=old_score.score,
            new_score=alternative_route.score,
            eta_delta_hours=eta_delta,
            risk_reduction_percent=risk_reduction_pct,
            explanation=explanation_text,
            accepted=False,
        )
        db.add(decision)

        # Mark vehicle as rerouted (pending driver acceptance)
        if route.vehicle_id:
            vehicle = db.get(models.Vehicle, route.vehicle_id)
            if vehicle:
                vehicle.status = "rerouted"

    # 5. Create alert (always, even if no route matched - operator should still see it)
    alert_severity = SEVERITY_TO_ALERT.get(incident.severity, "medium")
    alert = models.Alert(
        id=_new_id("AL"),
        title=f"{incident.type.replace('_', ' ').title()} Reported",
        description=incident.description or f"{incident.severity.title()} {incident.type.replace('_', ' ')} reported near ({incident.lat:.3f}, {incident.lng:.3f}).",
        severity=alert_severity,
        vehicle_id=route.vehicle_id if route else None,
        incident_id=incident.id,
    )
    db.add(alert)

    # 7. Bump impact stats
    stats = db.query(models.ImpactStats).first()
    if not stats:
        stats = models.ImpactStats()
        db.add(stats)
        db.flush()
    stats.incidents_handled += 1
    if alternative_route:
        stats.reroutes_issued += 1
        stats.corridors_avoided += 1
        stats.fuel_saved_liters += max(0.0, (route.distance_km * 0.08) if route else 0)
        stats.co2_saved_kg += max(0.0, (route.distance_km * 0.21) if route else 0)

    db.commit()
    db.refresh(incident)
    if updated_route:
        db.refresh(updated_route)
    if alternative_route:
        db.refresh(alternative_route)
    if alert:
        db.refresh(alert)
    if decision:
        db.refresh(decision)

    return {
        "incident": incident,
        "updated_route": updated_route,
        "alternative_route": alternative_route,
        "alert": alert,
        "decision": decision,
    }


def accept_reroute(db: Session, vehicle_id: str, decision_id: Optional[int] = None):
    """Driver accepts the proposed reroute: switch the vehicle onto the new
    route, deactivate the old one, mark the decision accepted.
    """
    query = db.query(models.RouteDecision).filter(models.RouteDecision.vehicle_id == vehicle_id)
    decision = db.get(models.RouteDecision, decision_id) if decision_id else query.order_by(models.RouteDecision.id.desc()).first()
    if not decision:
        return None

    vehicle = db.get(models.Vehicle, vehicle_id)
    new_route = db.get(models.Route, decision.new_route_id) if decision.new_route_id else None
    old_route = db.get(models.Route, decision.old_route_id) if decision.old_route_id else None

    if vehicle and new_route:
        vehicle.current_route_id = new_route.id
        vehicle.status = "in-transit"
        new_route.vehicle_id = vehicle.id
    if old_route:
        old_route.is_active = False

    decision.accepted = True
    db.commit()
    db.refresh(decision)
    return {"decision": decision, "vehicle": vehicle, "new_route": new_route}
