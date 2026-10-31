def test_health(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_fleet_seeded(client):
    resp = client.get("/api/fleet")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 5
    assert any(v["id"] == "TRK-8845" for v in data)


def test_routes_seeded(client):
    resp = client.get("/api/routes")
    assert resp.status_code == 200
    assert len(resp.json()) == 4


def test_impact_stats_default(client):
    resp = client.get("/api/impact")
    assert resp.status_code == 200
    body = resp.json()
    assert body["villages_reached"] == 342


def test_create_incident_triggers_full_flow(client):
    payload = {
        "type": "landslide",
        "severity": "severe",
        "lat": 27.2,
        "lng": 93.7,
        "description": "Simulated landslide for test",
    }
    resp = client.post("/api/incidents?vehicle_id=TRK-8845", json=payload)
    assert resp.status_code == 200
    body = resp.json()

    assert body["incident"]["type"] == "landslide"
    assert body["updated_route"] is not None
    assert body["updated_route"]["id"] == "RT-002"
    # risk should have gone up from the baseline (68) after a severe landslide
    assert body["updated_route"]["hazard_risk"] > 68

    assert body["alternative_route"] is not None
    assert body["alternative_route"]["hazard_risk"] < body["updated_route"]["hazard_risk"]
    assert body["alternative_route"]["is_ai_recommended"] is True

    assert body["alert"] is not None
    assert body["alert"]["severity"] == "critical"

    assert body["decision"] is not None
    assert "landslide" in body["decision"]["explanation"].lower()

    # impact stats should have incremented
    stats = client.get("/api/impact").json()
    assert stats["incidents_handled"] == 1
    assert stats["reroutes_issued"] == 1


def test_invalid_incident_type_rejected(client):
    resp = client.post("/api/incidents", json={
        "type": "meteor_strike", "severity": "high", "lat": 1.0, "lng": 1.0,
    })
    assert resp.status_code == 400


def test_reroute_accept_flow(client):
    payload = {"type": "flood", "severity": "high", "lat": 27.1, "lng": 93.65}
    create_resp = client.post("/api/incidents?vehicle_id=TRK-8845", json=payload)
    decision_id = create_resp.json()["decision"]["id"]

    accept_resp = client.post("/api/incidents/reroute/accept", json={
        "vehicle_id": "TRK-8845", "decision_id": decision_id,
    })
    assert accept_resp.status_code == 200
    assert accept_resp.json()["accepted"] is True

    vehicle = client.get("/api/fleet/TRK-8845").json()
    assert vehicle["status"] == "in-transit"
    assert vehicle["current_route_id"] == create_resp.json()["alternative_route"]["id"]


def test_blockage_report_creates_incident(client):
    payload = {
        "type": "road_blockage",
        "severity": "medium",
        "lat": 26.05,
        "lng": 91.6,
        "description": "Fallen tree blocking both lanes",
        "vehicle_id": "TRK-9012",
    }
    resp = client.post("/api/blockage-reports", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["report"]["type"] == "road_blockage"
    assert body["incident_response"]["incident"] is not None
    assert body["report"]["incident_id"] == body["incident_response"]["incident"]["id"]

    reports = client.get("/api/blockage-reports").json()
    assert len(reports) == 1


def test_route_comparison(client):
    client.post("/api/incidents?vehicle_id=TRK-8845", json={
        "type": "accident", "severity": "high", "lat": 27.2, "lng": 93.7,
    })
    resp = client.get("/api/routes/compare/TRK-8845")
    assert resp.status_code == 200
    body = resp.json()
    assert body["standard_route"]["id"] == "RT-002"
    assert body["ai_route"] is not None
    assert body["explanation"] is not None


def test_vehicle_position_update(client):
    resp = client.patch("/api/fleet/TRK-9012/position", json={"lat": 26.2, "lng": 91.8})
    assert resp.status_code == 200
    assert resp.json()["lat"] == 26.2


def test_route_hazard_api(client):
    resp = client.get("/api/routes/RT-002/hazard?horizon=6h")
    assert resp.status_code == 200
    data = resp.json()
    assert data["forecast_horizon"] == "6h"
    assert data["landslide"]["category"] == "landslide"
    assert data["flood"]["category"] == "flood"
    assert "factors" in data["landslide"]
    assert "data_timestamp" in data


def test_last_mile_api(client):
    payload = {
        "route_id": "RT-002",
        "max_walk_distance_m": 1000,
    }
    resp = client.post("/api/routes/last-mile/evaluate", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data
    assert "verified" in data
    assert "reasons" in data


def test_route_comparison_enriched(client):
    resp = client.get("/api/routes/compare/TRK-8845?horizon=3h&max_walk_distance_m=1000")
    assert resp.status_code == 200
    data = resp.json()
    assert data["vehicle_id"] == "TRK-8845"
    assert data["standard_route"]["id"] == "RT-002"
    assert data["standard_hazard"] is not None
    assert data["last_mile_option"] is not None
    assert "is_impassable" in data


def test_confirmed_closure_excluded_from_recommendations(client):
    """Confirmed severe closures must be marked impassable and excluded from ordinary recommendations."""
    payload = {
        "type": "landslide",
        "severity": "severe",
        "lat": 27.2,
        "lng": 93.7,
        "description": "Massive rockfall blocking NH-13 completely",
    }
    create_resp = client.post("/api/incidents?vehicle_id=TRK-8845", json=payload)
    assert create_resp.status_code == 200

    # The updated base route must NOT be AI-recommended
    assert create_resp.json()["updated_route"]["is_ai_recommended"] is False

    # Comparison endpoint must mark corridor as impassable with confirmed closure reasons
    cmp_resp = client.get("/api/routes/compare/TRK-8845")
    assert cmp_resp.status_code == 200
    cmp_data = cmp_resp.json()
    assert cmp_data["is_impassable"] is True
    assert len(cmp_data["closure_reasons"]) > 0
    assert "Landslide" in cmp_data["closure_reasons"][0]

    # The AI alternative must be recommended and active
    assert cmp_data["ai_route"] is not None
    assert cmp_data["ai_route"]["is_ai_recommended"] is True


