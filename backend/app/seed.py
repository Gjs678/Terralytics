"""Seed the DB with the existing frontend mock data, so the app works
immediately on first run. Only seeds if the vehicles table is empty
(idempotent across restarts).
"""
from sqlalchemy.orm import Session

from . import models
from .services import risk_engine


FLEET = [
    dict(id="TRK-9012", driver_name="Ranjan Das", status="in-transit", lat=26.1158, lng=91.7026,
         last_known_location_name="Guwahati NH-27", destination="Shillong", eta="2 hrs 15 mins",
         connectivity="online", current_route_id="RT-001"),
    dict(id="TRK-8845", driver_name="Amit Boro", status="rerouted", lat=27.0844, lng=93.6053,
         last_known_location_name="Itanagar Approach", destination="Ziro", eta="4 hrs",
         connectivity="online", current_route_id="RT-002"),
    dict(id="TRK-7721", driver_name="Tenzing Norgay", status="offline", lat=27.586, lng=91.869,
         last_known_location_name="Sela Pass", destination="Tawang", eta="Unknown",
         connectivity="offline-sms", current_route_id="RT-003"),
    dict(id="TRK-5534", driver_name="Debajit Saikia", status="delayed", lat=24.8333, lng=92.7789,
         last_known_location_name="Silchar bypass", destination="Aizawl", eta="+5 hrs",
         connectivity="no-signal", current_route_id="RT-004"),
    dict(id="TRK-1122", driver_name="Lalrinfela", status="in-transit", lat=23.7271, lng=92.7176,
         last_known_location_name="Aizawl City", destination="Champhai", eta="6 hrs",
         connectivity="online", current_route_id=None),
]

# id, vehicle_id, name, origin, destination, distance, time(h), hazard_risk, reliability_penalty, coords
ROUTES = [
    dict(id="RT-001", vehicle_id="TRK-9012", name="Guwahati - Shillong NH-40", origin_name="Guwahati",
         destination_name="Shillong", distance_km=100, travel_time_hours=2.25, hazard_risk=15, reliability_penalty=10,
         coordinates=[[26.1158, 91.7026], [25.9, 91.8], [25.5788, 91.8933]]),
    dict(id="RT-002", vehicle_id="TRK-8845", name="NH-13 Direct", origin_name="Itanagar", destination_name="Ziro",
         distance_km=145, travel_time_hours=3.5, hazard_risk=68, reliability_penalty=40,
         coordinates=[[27.0844, 93.6053], [27.2, 93.7], [27.4, 93.8], [27.55, 93.85]]),
    dict(id="RT-003", vehicle_id="TRK-7721", name="Sela Pass Route", origin_name="Sela Pass",
         destination_name="Tawang", distance_km=78, travel_time_hours=2.4, hazard_risk=35, reliability_penalty=25,
         coordinates=[[27.586, 91.869], [27.55, 91.85], [27.5861, 91.8631]]),
    dict(id="RT-004", vehicle_id="TRK-5534", name="Silchar - Aizawl Corridor", origin_name="Silchar",
         destination_name="Aizawl", distance_km=180, travel_time_hours=5.0, hazard_risk=42, reliability_penalty=30,
         coordinates=[[24.8333, 92.7789], [24.3, 92.75], [23.7271, 92.7176]]),
]

ALERTS = [
    dict(id="AL-101", title="Blockage Predicted",
         description="High probability of landslide on NH-13 near Along due to continuous 6hr rainfall.",
         severity="critical", vehicle_id=None),
    dict(id="AL-102", title="Reroute Issued",
         description="Vehicle TRK-8845 rerouted via alternate district road to avoid flooded zone.",
         severity="high", vehicle_id="TRK-8845"),
    dict(id="AL-103", title="Vehicle Offline",
         description="Vehicle TRK-7721 lost data connection at Sela Pass. Falling back to SMS polling.",
         severity="medium", vehicle_id="TRK-7721"),
    dict(id="AL-104", title="Weather Warning",
         description="IMD reports intense spell of rain expected in East Khasi Hills over the next 12 hours.",
         severity="info", vehicle_id=None),
]


def seed_if_empty(db: Session):
    if db.query(models.Vehicle).count() > 0:
        return

    for v in FLEET:
        db.add(models.Vehicle(**v))

    for r in ROUTES:
        route = models.Route(
            id=r["id"], vehicle_id=r["vehicle_id"], name=r["name"], origin_name=r["origin_name"],
            destination_name=r["destination_name"], distance_km=r["distance_km"],
            travel_time_hours=r["travel_time_hours"], hazard_risk=r["hazard_risk"],
            reliability_penalty=r["reliability_penalty"], is_active=True, is_ai_recommended=False,
        )
        score = risk_engine.compute_score(r["travel_time_hours"], r["hazard_risk"], r["reliability_penalty"])
        route.score = score.score
        route.coordinates = r["coordinates"]
        db.add(route)

    for a in ALERTS:
        db.add(models.Alert(**a))

    db.add(models.ImpactStats(
        on_time_delivery_percent=94.2,
        corridors_avoided=17,
        fuel_saved_liters=4250,
        co2_saved_kg=11390,
        villages_reached=342,
        incidents_handled=0,
        reroutes_issued=0,
    ))

    db.commit()
