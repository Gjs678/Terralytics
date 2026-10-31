"""MOSSAM backend entrypoint.

Run with:
    uvicorn app.main:app --reload

Creates tables on startup (no Alembic - fine for a hackathon prototype),
seeds mock data if the DB is empty, and wires up CORS for the Vite dev
server plus all the route modules.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import models
from .database import engine, SessionLocal
from .seed import seed_if_empty
from .routes import fleet, routes_api, incidents, alerts, blockage, impact

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="MOSSAM API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # hackathon prototype: allow the Vite dev server (any port) freely
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    db = SessionLocal()
    try:
        seed_if_empty(db)
    finally:
        db.close()


@app.get("/api/health")
def health():
    return {"status": "ok"}


app.include_router(fleet.router)
app.include_router(routes_api.router)
app.include_router(incidents.router)
app.include_router(alerts.router)
app.include_router(blockage.router)
app.include_router(impact.router)
