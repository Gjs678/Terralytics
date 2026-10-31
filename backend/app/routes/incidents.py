from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..services.incident_service import create_incident_flow, accept_reroute

router = APIRouter(prefix="/api/incidents", tags=["incidents"])

VALID_TYPES = {"landslide", "flood", "road_blockage", "accident", "heavy_rainfall"}
VALID_SEVERITIES = {"low", "medium", "high", "severe"}


@router.get("", response_model=list[schemas.IncidentOut])
def list_incidents(status: str | None = None, db: Session = Depends(get_db)):
    q = db.query(models.Incident)
    if status:
        q = q.filter(models.Incident.status == status)
    return q.order_by(models.Incident.created_at.desc()).all()


@router.post("", response_model=schemas.IncidentResponse)
def create_incident(
    payload: schemas.IncidentCreate,
    vehicle_id: str | None = Query(default=None, description="Vehicle whose route is affected"),
    use_ollama: bool = Query(default=False, description="Ask local Ollama to reword the explanation"),
    db: Session = Depends(get_db),
):
    """The central incident endpoint: persists the incident and runs the
    full create -> risk update -> reroute -> alert -> impact pipeline."""
    if payload.type not in VALID_TYPES:
        raise HTTPException(400, f"type must be one of {sorted(VALID_TYPES)}")
    if payload.severity not in VALID_SEVERITIES:
        raise HTTPException(400, f"severity must be one of {sorted(VALID_SEVERITIES)}")

    result = create_incident_flow(db, payload, vehicle_id=vehicle_id, use_ollama=use_ollama)
    return result


@router.post("/{incident_id}/resolve", response_model=schemas.IncidentOut)
def resolve_incident(incident_id: str, db: Session = Depends(get_db)):
    incident = db.get(models.Incident, incident_id)
    if not incident:
        raise HTTPException(404, "Incident not found")
    incident.status = "resolved"
    db.commit()
    db.refresh(incident)
    return incident


@router.post("/reroute/accept", response_model=schemas.RouteDecisionOut)
def accept_route_reroute(payload: schemas.RerouteAcceptRequest, db: Session = Depends(get_db)):
    result = accept_reroute(db, payload.vehicle_id, payload.decision_id)
    if not result:
        raise HTTPException(404, "No pending reroute decision found for this vehicle")
    return result["decision"]
