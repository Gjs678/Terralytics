import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..services.incident_service import create_incident_flow

router = APIRouter(prefix="/api/blockage-reports", tags=["blockage"])


@router.get("", response_model=list[schemas.BlockageReportOut])
def list_reports(db: Session = Depends(get_db)):
    return db.query(models.BlockageReport).order_by(models.BlockageReport.created_at.desc()).all()


@router.post("", response_model=schemas.BlockageReportResponse)
def submit_report(
    payload: schemas.BlockageReportCreate,
    use_ollama: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    """A driver/community blockage report becomes a real incident and
    triggers the exact same incident/rerouting flow as a control-room
    simulated incident (per the project brief)."""
    incident_payload = schemas.IncidentCreate(
        type=payload.type,
        severity=payload.severity,
        lat=payload.lat,
        lng=payload.lng,
        description=payload.description or "Reported by driver/community blockage report.",
        source="driver" if payload.vehicle_id else "community",
    )
    incident_result = create_incident_flow(db, incident_payload, vehicle_id=payload.vehicle_id, use_ollama=use_ollama)

    report = models.BlockageReport(
        id=f"BLK-{uuid.uuid4().hex[:6].upper()}",
        type=payload.type,
        severity=payload.severity,
        lat=payload.lat,
        lng=payload.lng,
        description=payload.description,
        vehicle_id=payload.vehicle_id,
        incident_id=incident_result["incident"].id,
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    return {"report": report, "incident_response": incident_result}
