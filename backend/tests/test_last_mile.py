"""Unit tests for Safe Vehicle-to-Foot Last-Mile Routing (Feature 2)."""
import pytest
from app.services import last_mile_service


class DummyRoute:
    def __init__(self, route_id="RT-002", distance_km=145.0, travel_time_hours=3.5):
        self.id = route_id
        self.distance_km = distance_km
        self.travel_time_hours = travel_time_hours
        self.destination_name = "Ziro Town"
        # 4 points terminating near Ziro
        self.coordinates = [
            [27.0844, 93.6053],
            [27.3500, 93.7500],
            [27.5350, 93.8420],  # ~650m from end
            [27.5400, 93.8450],  # destination
        ]


def test_provider_inspection_unverified_when_unconfigured():
    """When no pedestrian router is configured, provider inspection returns unverified status."""
    is_valid, msg = last_mile_service.inspect_pedestrian_provider(router_url="")
    assert is_valid is False
    assert "No dedicated pedestrian routing provider" in msg


def test_unverified_path_never_draws_straight_line():
    """When pedestrian routing cannot be verified, status is 'unverified', path is None, and never straight-line."""
    route = DummyRoute()
    result = last_mile_service.evaluate_last_mile(
        route=route,
        max_walk_distance_m=1000,
        custom_pedestrian_provider="",  # No provider configured
    )
    assert result["verified"] is False
    assert result["status"] == "unverified"
    assert result["is_accepted"] is False
    assert result["pedestrian_path"] is None
    assert any("unmapped" in r.lower() or "unverified" in r.lower() for r in result["reasons"])
    assert result["best_vehicle_route"] is not None


def test_last_mile_accepted_when_road_closed_and_footway_safe():
    """When the road approach has a closure and verified footway is safe, option is accepted."""
    route = DummyRoute()
    # Simulated verified footway along an existing local path
    simulated_foot = {
        "coordinates": [
            [27.5350, 93.8420],
            [27.5365, 93.8430],
            [27.5385, 93.8442],
            [27.5400, 93.8450],
        ],
        "distance_m": 620.0,
        "duration_s": 480.0,
    }
    # Incident causing road blockage
    incidents = [
        {"id": "INC-1", "type": "road_blockage", "severity": "severe", "description": "Fallen rocks blocking vehicle road"}
    ]

    result = last_mile_service.evaluate_last_mile(
        route=route,
        max_walk_distance_m=1000,
        active_incidents=incidents,
        simulated_foot_path=simulated_foot,
    )

    assert result["verified"] is True
    assert result["is_accepted"] is True
    assert result["status"] == "accepted"
    assert result["walking_distance_m"] == 620.0
    assert result["pedestrian_path"] is not None
    assert len(result["pedestrian_path"]) == 4
    assert any("blocked" in r.lower() for r in result["reasons"])


def test_last_mile_rejected_when_hazard_intersects_footpath():
    """When an active hazard (e.g. landslide) is on or near the pedestrian path, option is rejected for safety."""
    route = DummyRoute()
    simulated_foot = {
        "coordinates": [
            [27.5350, 93.8420],
            [27.5370, 93.8435],
            [27.5400, 93.8450],
        ],
        "distance_m": 580.0,
        "duration_s": 420.0,
    }
    # Active landslide exactly adjacent to middle of footpath (~20m away)
    incidents = [
        {"id": "INC-2", "type": "landslide", "severity": "high", "lat": 27.5371, "lng": 93.8436, "description": "Active mudflow"}
    ]

    result = last_mile_service.evaluate_last_mile(
        route=route,
        max_walk_distance_m=1000,
        active_incidents=incidents,
        simulated_foot_path=simulated_foot,
    )

    assert result["verified"] is True
    assert result["is_accepted"] is False
    assert result["status"] == "rejected"
    assert any("active hazards" in r.lower() or "landslide" in r.lower() for r in result["reasons"])


def test_last_mile_rejected_when_exceeds_max_walk_distance():
    """When configured max walking distance is 500m and path is 750m, option is rejected."""
    route = DummyRoute()
    route.coordinates = [
        [27.0844, 93.6053],
        [27.3500, 93.7500],
        [27.5370, 93.8430],  # ~390m straight-line from destination (valid stopping point within 500m)
        [27.5400, 93.8450],  # destination
    ]
    simulated_foot = {
        "coordinates": [[27.5370, 93.8430], [27.5400, 93.8450]],
        "distance_m": 750.0,  # actual winding footway distance exceeds 500m
        "duration_s": 560.0,
    }

    result = last_mile_service.evaluate_last_mile(
        route=route,
        max_walk_distance_m=500,  # 500m strict preference
        simulated_foot_path=simulated_foot,
    )

    assert result["verified"] is True
    assert result["is_accepted"] is False
    assert result["status"] == "rejected"
    assert any("exceeds configured limit (500m)" in r for r in result["reasons"])


def test_last_mile_rejected_when_vehicle_transit_is_faster_and_clear():
    """Do not choose walking simply because distance is short; compare total journey time."""
    # Short route where vehicle can drive the final stretch in 1 minute, but walking takes 9 minutes
    route = DummyRoute(distance_km=2.0, travel_time_hours=0.05)  # 3 mins total vehicle time
    simulated_foot = {
        "coordinates": [[27.5350, 93.8420], [27.5400, 93.8450]],
        "distance_m": 600.0,
        "duration_s": 480.0,  # 8 mins walking + 3 mins buffer = 11 mins multimodal vs 3 mins vehicle
    }

    result = last_mile_service.evaluate_last_mile(
        route=route,
        max_walk_distance_m=1000,
        active_incidents=[],  # Road is clear
        simulated_foot_path=simulated_foot,
    )

    assert result["verified"] is True
    assert result["is_accepted"] is False
    assert result["status"] == "rejected"
    assert any("faster" in r.lower() for r in result["reasons"])
