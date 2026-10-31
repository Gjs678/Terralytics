"""SQLAlchemy ORM models for MOSSAM.

Tables: vehicles, routes, incidents, alerts, blockage_reports, route_decisions.
Kept intentionally flat/simple (a few JSON-ish text columns for coordinate
lists) so the schema stays beginner-readable and SQLite-friendly.
"""
import json
from datetime import datetime

from sqlalchemy import Column, String, Float, Integer, DateTime, Text, Boolean, ForeignKey
from sqlalchemy.orm import relationship

from .database import Base


class JSONText:
    """Small helper mixin: store a Python list/dict as a JSON string column."""

    @staticmethod
    def dumps(value):
        return json.dumps(value if value is not None else [])

    @staticmethod
    def loads(value):
        return json.loads(value) if value else []


class Vehicle(Base):
    __tablename__ = "vehicles"

    id = Column(String, primary_key=True)  # e.g. TRK-9012
    driver_name = Column(String, nullable=False)
    status = Column(String, default="in-transit")  # in-transit | rerouted | delayed | offline
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    last_known_location_name = Column(String, default="")
    destination = Column(String, default="")
    eta = Column(String, default="")
    connectivity = Column(String, default="online")  # online | offline-sms | no-signal
    current_route_id = Column(String, ForeignKey("routes.id"), nullable=True)

    route = relationship("Route", foreign_keys=[current_route_id])


class Route(Base):
    __tablename__ = "routes"

    id = Column(String, primary_key=True)  # e.g. RT-001
    vehicle_id = Column(String, ForeignKey("vehicles.id"), nullable=True)
    name = Column(String, nullable=False)
    origin_name = Column(String, default="")
    destination_name = Column(String, default="")
    distance_km = Column(Float, default=0)
    travel_time_hours = Column(Float, default=0)
    hazard_risk = Column(Float, default=0)  # 0-100
    reliability_penalty = Column(Float, default=0)  # 0-100, higher = less reliable
    score = Column(Float, default=0)  # computed route_score, lower is better
    is_active = Column(Boolean, default=True)
    is_ai_recommended = Column(Boolean, default=False)
    coordinates_json = Column(Text, default="[]")  # list of [lat, lng]

    @property
    def coordinates(self):
        return JSONText.loads(self.coordinates_json)

    @coordinates.setter
    def coordinates(self, value):
        self.coordinates_json = JSONText.dumps(value)


class Incident(Base):
    __tablename__ = "incidents"

    id = Column(String, primary_key=True)  # e.g. INC-1001
    type = Column(String, nullable=False)  # landslide | flood | road_blockage | accident | heavy_rainfall
    severity = Column(String, nullable=False)  # low | medium | high | severe
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    description = Column(Text, default="")
    affected_route_id = Column(String, ForeignKey("routes.id"), nullable=True)
    status = Column(String, default="active")  # active | resolved
    source = Column(String, default="control-room")  # control-room | driver | community
    created_at = Column(DateTime, default=datetime.utcnow)


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(String, primary_key=True)
    title = Column(String, nullable=False)
    description = Column(Text, default="")
    severity = Column(String, default="info")  # critical | high | medium | info
    vehicle_id = Column(String, nullable=True)
    incident_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class BlockageReport(Base):
    __tablename__ = "blockage_reports"

    id = Column(String, primary_key=True)
    type = Column(String, nullable=False)
    severity = Column(String, nullable=False)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    description = Column(Text, default="")
    vehicle_id = Column(String, nullable=True)
    incident_id = Column(String, nullable=True)  # incident this report generated
    created_at = Column(DateTime, default=datetime.utcnow)


class RouteDecision(Base):
    """An audit record of a routing decision (why a route was chosen/changed)."""
    __tablename__ = "route_decisions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    vehicle_id = Column(String, nullable=True)
    incident_id = Column(String, nullable=True)
    old_route_id = Column(String, nullable=True)
    new_route_id = Column(String, nullable=True)
    old_score = Column(Float, default=0)
    new_score = Column(Float, default=0)
    eta_delta_hours = Column(Float, default=0)
    risk_reduction_percent = Column(Float, default=0)
    explanation = Column(Text, default="")
    accepted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class ImpactStats(Base):
    """Single-row running counters used for the impact dashboard."""
    __tablename__ = "impact_stats"

    id = Column(Integer, primary_key=True, autoincrement=True)
    on_time_delivery_percent = Column(Float, default=94.2)
    corridors_avoided = Column(Integer, default=0)
    fuel_saved_liters = Column(Float, default=0)
    co2_saved_kg = Column(Float, default=0)
    villages_reached = Column(Integer, default=0)
    incidents_handled = Column(Integer, default=0)
    reroutes_issued = Column(Integer, default=0)
