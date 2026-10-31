"""Pydantic request/response schemas for MOSSAM's API."""
from datetime import datetime
from typing import List, Optional, Tuple, Any, Dict

from pydantic import BaseModel, ConfigDict


class LatLng(BaseModel):
    lat: float
    lng: float


# ---------- Vehicles ----------

class VehicleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    driver_name: str
    status: str
    lat: float
    lng: float
    last_known_location_name: str
    destination: str
    eta: str
    connectivity: str
    current_route_id: Optional[str] = None


class VehiclePositionUpdate(BaseModel):
    lat: float
    lng: float


# ---------- Predictive Hazard & Last-Mile Schemas ----------

class FactorContributionOut(BaseModel):
    name: str
    category: str
    impact_score: Optional[float] = None
    weight: float
    source: str
    raw_value: Optional[Any] = None
    status: str = "measured"


class HazardCategoryOut(BaseModel):
    category: str
    risk_index: Optional[float] = None
    risk_level: str
    terrain_susceptibility: Optional[float] = None
    observed_impact: Optional[float] = None
    predicted_trigger: Optional[float] = None
    is_unknown: bool = False
    factors: List[FactorContributionOut] = []


class PredictiveHazardEstimateOut(BaseModel):
    overall_hazard_index: Optional[float] = None
    overall_risk_level: str
    forecast_horizon: str
    landslide: HazardCategoryOut
    flood: HazardCategoryOut
    is_impassable: bool = False
    closure_reasons: List[str] = []
    data_freshness: str = "fresh"
    data_timestamp: str
    scoring_method: str
    confidence_note: str


class LastMileStoppingPointOut(BaseModel):
    lat: float
    lng: float
    name: str


class LastMileDestinationOut(BaseModel):
    lat: float
    lng: float
    name: str


class LastMileEvaluationOut(BaseModel):
    status: str  # accepted | rejected | unverified
    verified: bool
    is_accepted: bool
    max_walk_distance_m: int
    stopping_point: Optional[LastMileStoppingPointOut] = None
    destination: Optional[LastMileDestinationOut] = None
    walking_distance_m: Optional[float] = None
    walking_time_minutes: Optional[float] = None
    transition_buffer_minutes: Optional[float] = None
    vehicle_detour_avoided_km: Optional[float] = None
    vehicle_only_time_minutes: Optional[float] = None
    multimodal_total_time_minutes: Optional[float] = None
    time_saved_minutes: Optional[float] = None
    pedestrian_path: Optional[List[List[float]]] = None
    reasons: List[str] = []
    best_vehicle_route: Optional[Dict[str, Any]] = None


class LastMileEvaluateRequest(BaseModel):
    route_id: Optional[str] = None
    vehicle_id: Optional[str] = None
    max_walk_distance_m: int = 1000
    destination: Optional[LatLng] = None


# ---------- Routes ----------

class RouteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    vehicle_id: Optional[str] = None
    name: str
    origin_name: str
    destination_name: str
    distance_km: float
    travel_time_hours: float
    hazard_risk: float
    reliability_penalty: float
    score: float
    is_active: bool
    is_ai_recommended: bool
    coordinates: List[Tuple[float, float]]


class RouteComparisonOut(BaseModel):
    vehicle_id: str
    standard_route: RouteOut
    ai_route: Optional[RouteOut] = None
    explanation: Optional[str] = None
    standard_hazard: Optional[PredictiveHazardEstimateOut] = None
    ai_hazard: Optional[PredictiveHazardEstimateOut] = None
    last_mile_option: Optional[LastMileEvaluationOut] = None
    forecast_horizon: str = "3h"
    is_impassable: bool = False
    closure_reasons: List[str] = []


# ---------- Incidents ----------

class IncidentCreate(BaseModel):
    type: str  # landslide | flood | road_blockage | accident | heavy_rainfall
    severity: str  # low | medium | high | severe
    lat: float
    lng: float
    description: str = ""
    affected_route_id: Optional[str] = None
    source: str = "control-room"


class IncidentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    type: str
    severity: str
    lat: float
    lng: float
    description: str
    affected_route_id: Optional[str] = None
    status: str
    source: str
    created_at: datetime


class IncidentResponse(BaseModel):
    """What the client gets back after triggering an incident: the incident
    itself plus everything the incident flow produced."""
    incident: IncidentOut
    updated_route: Optional[RouteOut] = None
    alternative_route: Optional[RouteOut] = None
    alert: Optional["AlertOut"] = None
    decision: Optional["RouteDecisionOut"] = None


# ---------- Alerts ----------

class AlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    title: str
    description: str
    severity: str
    vehicle_id: Optional[str] = None
    incident_id: Optional[str] = None
    created_at: datetime


# ---------- Blockage / community reports ----------

class BlockageReportCreate(BaseModel):
    type: str
    severity: str
    lat: float
    lng: float
    description: str = ""
    vehicle_id: Optional[str] = None


class BlockageReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    type: str
    severity: str
    lat: float
    lng: float
    description: str
    vehicle_id: Optional[str] = None
    incident_id: Optional[str] = None
    created_at: datetime


class BlockageReportResponse(BaseModel):
    report: BlockageReportOut
    incident_response: IncidentResponse


# ---------- Route decisions ----------

class RouteDecisionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    vehicle_id: Optional[str] = None
    incident_id: Optional[str] = None
    old_route_id: Optional[str] = None
    new_route_id: Optional[str] = None
    old_score: float
    new_score: float
    eta_delta_hours: float
    risk_reduction_percent: float
    explanation: str
    accepted: bool
    created_at: datetime


class RerouteAcceptRequest(BaseModel):
    vehicle_id: str
    decision_id: Optional[int] = None


# ---------- Impact stats ----------

class ImpactStatsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    on_time_delivery_percent: float
    corridors_avoided: int
    fuel_saved_liters: float
    co2_saved_kg: float
    villages_reached: int
    incidents_handled: int
    reroutes_issued: int


IncidentResponse.model_rebuild()
