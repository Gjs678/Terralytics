// Thin fetch-based API client for the MOSSAM FastAPI backend.
// No new dependency added (plain fetch), matches project constraints.

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch (err) {
    throw new ApiError('Cannot reach TERRALYTICS backend. Is it running on ' + API_BASE_URL + '?');
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch (e) {
      // ignore
    }
    throw new ApiError(detail, res.status);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

// ---------- Types (mirroring backend Pydantic schemas) ----------

export interface VehicleDto {
  id: string;
  driver_name: string;
  status: 'in-transit' | 'rerouted' | 'delayed' | 'offline';
  lat: number;
  lng: number;
  last_known_location_name: string;
  destination: string;
  eta: string;
  connectivity: 'online' | 'offline-sms' | 'no-signal';
  current_route_id: string | null;
}

export interface RouteDto {
  id: string;
  vehicle_id: string | null;
  name: string;
  origin_name: string;
  destination_name: string;
  distance_km: number;
  travel_time_hours: number;
  hazard_risk: number;
  reliability_penalty: number;
  score: number;
  is_active: boolean;
  is_ai_recommended: boolean;
  coordinates: [number, number][];
}

export interface FactorContributionDto {
  name: string;
  category: 'terrain' | 'observed' | 'predicted' | 'incident';
  impact_score: number | null;
  weight: number;
  source: string;
  raw_value?: string | number | null;
  status: 'measured' | 'simulated' | 'unknown';
}

export interface HazardCategoryDto {
  category: 'landslide' | 'flood';
  risk_index: number | null;
  risk_level: 'low' | 'medium' | 'high' | 'critical' | 'unknown';
  terrain_susceptibility: number | null;
  observed_impact: number | null;
  predicted_trigger: number | null;
  is_unknown: boolean;
  factors: FactorContributionDto[];
}

export interface PredictiveHazardEstimateDto {
  overall_hazard_index: number | null;
  overall_risk_level: 'low' | 'medium' | 'high' | 'critical' | 'unknown';
  forecast_horizon: string;
  landslide: HazardCategoryDto;
  flood: HazardCategoryDto;
  is_impassable: boolean;
  closure_reasons: string[];
  data_freshness: 'fresh' | 'stale' | 'simulated' | 'unknown';
  data_timestamp: string;
  scoring_method: string;
  confidence_note: string;
}

export interface LastMileStoppingPointDto {
  lat: number;
  lng: number;
  name: string;
}

export interface LastMileEvaluationDto {
  status: 'accepted' | 'rejected' | 'unverified';
  verified: boolean;
  is_accepted: boolean;
  max_walk_distance_m: number;
  stopping_point: LastMileStoppingPointDto | null;
  destination: { lat: number; lng: number; name: string } | null;
  walking_distance_m: number | null;
  walking_time_minutes: number | null;
  transition_buffer_minutes: number | null;
  vehicle_detour_avoided_km: number | null;
  vehicle_only_time_minutes: number | null;
  multimodal_total_time_minutes: number | null;
  time_saved_minutes: number | null;
  pedestrian_path: [number, number][] | null;
  reasons: string[];
  best_vehicle_route?: {
    distance_km: number;
    time_minutes: number;
    destination: string;
  } | null;
}

export interface RouteComparisonDto {
  vehicle_id: string;
  standard_route: RouteDto;
  ai_route: RouteDto | null;
  explanation: string | null;
  standard_hazard?: PredictiveHazardEstimateDto | null;
  ai_hazard?: PredictiveHazardEstimateDto | null;
  last_mile_option?: LastMileEvaluationDto | null;
  forecast_horizon?: string;
  is_impassable?: boolean;
  closure_reasons?: string[];
}

export interface IncidentDto {
  id: string;
  type: string;
  severity: string;
  lat: number;
  lng: number;
  description: string;
  affected_route_id: string | null;
  status: string;
  source: string;
  created_at: string;
}

export interface RouteDecisionDto {
  id: number;
  vehicle_id: string | null;
  incident_id: string | null;
  old_route_id: string | null;
  new_route_id: string | null;
  old_score: number;
  new_score: number;
  eta_delta_hours: number;
  risk_reduction_percent: number;
  explanation: string;
  accepted: boolean;
  created_at: string;
}

export interface IncidentResponseDto {
  incident: IncidentDto;
  updated_route: RouteDto | null;
  alternative_route: RouteDto | null;
  alert: AlertDto | null;
  decision: RouteDecisionDto | null;
}

export interface AlertDto {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'info';
  vehicle_id: string | null;
  incident_id: string | null;
  created_at: string;
}

export interface BlockageReportInput {
  type: string;
  severity: string;
  lat: number;
  lng: number;
  description?: string;
  vehicle_id?: string;
}

export interface BlockageReportResponseDto {
  report: {
    id: string;
    type: string;
    severity: string;
    lat: number;
    lng: number;
    description: string;
    vehicle_id: string | null;
    incident_id: string | null;
    created_at: string;
  };
  incident_response: IncidentResponseDto;
}

export interface ImpactStatsDto {
  on_time_delivery_percent: number;
  corridors_avoided: number;
  fuel_saved_liters: number;
  co2_saved_kg: number;
  villages_reached: number;
  incidents_handled: number;
  reroutes_issued: number;
}

// ---------- API methods ----------

export const mossamApi = {
  health: () => request<{ status: string }>('/api/health'),

  getFleet: () => request<VehicleDto[]>('/api/fleet'),
  getVehicle: (id: string) => request<VehicleDto>(`/api/fleet/${id}`),
  updateVehiclePosition: (id: string, lat: number, lng: number) =>
    request<VehicleDto>(`/api/fleet/${id}/position`, {
      method: 'PATCH',
      body: JSON.stringify({ lat, lng }),
    }),

  getRoutes: (vehicleId?: string) =>
    request<RouteDto[]>(`/api/routes${vehicleId ? `?vehicle_id=${vehicleId}` : ''}`),
  compareRoutes: (vehicleId: string, horizon: string = '3h', maxWalkDistanceM: number = 1000) =>
    request<RouteComparisonDto>(`/api/routes/compare/${vehicleId}?horizon=${horizon}&max_walk_distance_m=${maxWalkDistanceM}`),
  getRouteHazard: (routeId: string, horizon: string = '3h') =>
    request<PredictiveHazardEstimateDto>(`/api/routes/${routeId}/hazard?horizon=${horizon}`),
  evaluateLastMile: (payload: { route_id?: string; vehicle_id?: string; max_walk_distance_m?: number }) =>
    request<LastMileEvaluationDto>('/api/routes/last-mile/evaluate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getIncidents: (status?: string) =>
    request<IncidentDto[]>(`/api/incidents${status ? `?status=${status}` : ''}`),
  createIncident: (
    payload: { type: string; severity: string; lat: number; lng: number; description?: string; affected_route_id?: string },
    vehicleId?: string
  ) =>
    request<IncidentResponseDto>(
      `/api/incidents${vehicleId ? `?vehicle_id=${vehicleId}` : ''}`,
      { method: 'POST', body: JSON.stringify(payload) }
    ),
  acceptReroute: (vehicleId: string, decisionId?: number) =>
    request<RouteDecisionDto>('/api/incidents/reroute/accept', {
      method: 'POST',
      body: JSON.stringify({ vehicle_id: vehicleId, decision_id: decisionId }),
    }),

  getAlerts: () => request<AlertDto[]>('/api/alerts'),

  getBlockageReports: () => request<BlockageReportResponseDto['report'][]>('/api/blockage-reports'),
  submitBlockageReport: (payload: BlockageReportInput) =>
    request<BlockageReportResponseDto>('/api/blockage-reports', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getImpactStats: () => request<ImpactStatsDto>('/api/impact'),
};

export { API_BASE_URL };
