import dataclasses
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..services import risk_engine, last_mile_service

router = APIRouter(prefix="/api/routes", tags=["routes"])


@router.get("", response_model=list[schemas.RouteOut])
def list_routes(vehicle_id: str | None = None, db: Session = Depends(get_db)):
    q = db.query(models.Route)
    if vehicle_id:
        q = q.filter(models.Route.vehicle_id == vehicle_id)
    return q.all()


@router.get("/{route_id}", response_model=schemas.RouteOut)
def get_route(route_id: str, db: Session = Depends(get_db)):
    route = db.get(models.Route, route_id)
    if not route:
        raise HTTPException(404, "Route not found")
    return route


@router.get("/{route_id}/hazard", response_model=schemas.PredictiveHazardEstimateOut)
def get_route_hazard(
    route_id: str,
    horizon: str = Query(default="3h", description="Forecast horizon (1h, 3h, 6h, 24h)"),
    live_weather: bool = Query(default=False, description="Attempt genuine forecast fetch from Open-Meteo"),
    db: Session = Depends(get_db),
):
    """Predictive hazard estimation for a specific route corridor."""
    route = db.get(models.Route, route_id)
    if not route:
        raise HTTPException(404, "Route not found")

    active_incidents = db.query(models.Incident).filter(models.Incident.status == "active").all()
    hazard_est = risk_engine.estimate_route_hazard(
        route=route,
        active_incidents=active_incidents,
        forecast_horizon=horizon,
        fetch_live_weather=live_weather,
    )
    return dataclasses.asdict(hazard_est)


@router.post("/last-mile/evaluate", response_model=schemas.LastMileEvaluationOut)
def evaluate_last_mile_route(
    payload: schemas.LastMileEvaluateRequest,
    db: Session = Depends(get_db),
):
    """Evaluate whether vehicle journey can be safely shortened by walking the last 500m to 1km."""
    route = None
    if payload.route_id:
        route = db.get(models.Route, payload.route_id)
    elif payload.vehicle_id:
        vehicle = db.get(models.Vehicle, payload.vehicle_id)
        if vehicle and vehicle.current_route_id:
            route = db.get(models.Route, vehicle.current_route_id)

    if not route:
        raise HTTPException(404, "Route not found for last-mile evaluation")

    active_incidents = [
        {
            "id": inc.id,
            "type": inc.type,
            "severity": inc.severity,
            "lat": inc.lat,
            "lng": inc.lng,
            "description": inc.description,
            "status": inc.status,
        }
        for inc in db.query(models.Incident).filter(models.Incident.status == "active").all()
    ]

    dest_dict = None
    if payload.destination:
        dest_dict = {"lat": payload.destination.lat, "lng": payload.destination.lng}

    eval_result = last_mile_service.evaluate_last_mile(
        route=route,
        destination=dest_dict,
        max_walk_distance_m=payload.max_walk_distance_m,
        active_incidents=active_incidents,
    )
    return eval_result


@router.get("/compare/{vehicle_id}", response_model=schemas.RouteComparisonOut)
def compare_routes(
    vehicle_id: str,
    horizon: str = Query(default="3h", description="Forecast horizon (1h, 3h, 6h, 24h)"),
    max_walk_distance_m: int = Query(default=1000, description="Max walking preference in meters (500 or 1000)"),
    db: Session = Depends(get_db),
):
    """Show the vehicle's current (standard) route next to the best
    AI-recommended alternative, enriched with multi-hazard predictive breakdowns,
    confirmed closure / impassability flags, and verified last-mile evaluations.
    """
    vehicle = db.get(models.Vehicle, vehicle_id)
    if not vehicle:
        raise HTTPException(404, "Vehicle not found")

    standard_route = db.get(models.Route, vehicle.current_route_id) if vehicle.current_route_id else None
    if not standard_route:
        raise HTTPException(404, "No active route for this vehicle")

    # Fetch active incidents
    active_incidents = db.query(models.Incident).filter(models.Incident.status == "active").all()

    # 1. Predictive Hazard Estimate for standard route
    standard_hazard = risk_engine.estimate_route_hazard(
        standard_route,
        active_incidents=active_incidents,
        forecast_horizon=horizon,
    )

    decision = (
        db.query(models.RouteDecision)
        .filter(models.RouteDecision.vehicle_id == vehicle_id, models.RouteDecision.accepted == False)  # noqa: E712
        .order_by(models.RouteDecision.id.desc())
        .first()
    )

    ai_route = None
    ai_hazard_out = None
    explanation = None
    if decision and decision.new_route_id:
        ai_route = db.get(models.Route, decision.new_route_id)
        explanation = decision.explanation
        if ai_route:
            ai_hazard = risk_engine.estimate_route_hazard(
                ai_route,
                active_incidents=active_incidents,
                forecast_horizon=horizon,
            )
            ai_hazard_out = schemas.PredictiveHazardEstimateOut(**dataclasses.asdict(ai_hazard))

    # 2. Last-mile vehicle-to-foot evaluation
    inc_dicts = [
        {
            "id": inc.id,
            "type": inc.type,
            "severity": inc.severity,
            "lat": inc.lat,
            "lng": inc.lng,
            "description": inc.description,
            "status": inc.status,
        }
        for inc in active_incidents
    ]
    last_mile_res = last_mile_service.evaluate_last_mile(
        route=standard_route,
        max_walk_distance_m=max_walk_distance_m,
        active_incidents=inc_dicts,
    )

    return schemas.RouteComparisonOut(
        vehicle_id=vehicle_id,
        standard_route=standard_route,
        ai_route=ai_route,
        explanation=explanation,
        standard_hazard=schemas.PredictiveHazardEstimateOut(**dataclasses.asdict(standard_hazard)),
        ai_hazard=ai_hazard_out,
        last_mile_option=schemas.LastMileEvaluationOut(**last_mile_res),
        forecast_horizon=horizon,
        is_impassable=standard_hazard.is_impassable,
        closure_reasons=standard_hazard.closure_reasons,
    )
