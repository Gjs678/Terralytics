from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/fleet", tags=["fleet"])


@router.get("", response_model=list[schemas.VehicleOut])
def list_fleet(db: Session = Depends(get_db)):
    return db.query(models.Vehicle).all()


@router.get("/{vehicle_id}", response_model=schemas.VehicleOut)
def get_vehicle(vehicle_id: str, db: Session = Depends(get_db)):
    vehicle = db.get(models.Vehicle, vehicle_id)
    if not vehicle:
        raise HTTPException(404, "Vehicle not found")
    return vehicle


@router.patch("/{vehicle_id}/position", response_model=schemas.VehicleOut)
def update_position(vehicle_id: str, payload: schemas.VehiclePositionUpdate, db: Session = Depends(get_db)):
    """Used by the simulated driver-movement demo to move a vehicle marker."""
    vehicle = db.get(models.Vehicle, vehicle_id)
    if not vehicle:
        raise HTTPException(404, "Vehicle not found")
    vehicle.lat = payload.lat
    vehicle.lng = payload.lng
    db.commit()
    db.refresh(vehicle)
    return vehicle
