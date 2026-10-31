from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/impact", tags=["impact"])


@router.get("", response_model=schemas.ImpactStatsOut)
def get_impact_stats(db: Session = Depends(get_db)):
    stats = db.query(models.ImpactStats).first()
    if not stats:
        stats = models.ImpactStats()
        db.add(stats)
        db.commit()
        db.refresh(stats)
    return stats
