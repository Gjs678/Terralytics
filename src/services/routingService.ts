/**
 * Routing Service
 * 
 * Manages route retrieval, route comparison (standard vs AI recommended),
 * detailed road geometry retrieval via OSRM, and reroute authorization guardrails.
 */

import type { RouteComparisonDto } from './api.ts';
import type { DeliveryOrder } from './deliveryService.ts';
import { hazardService, type RouteHazardAssessment } from './hazardService.ts';

export interface RouteGeometryPoint {
  lat: number;
  lng: number;
}

export interface RouteComparisonSummary {
  vehicleId: string;
  hasPendingReroute: boolean;
  standardRoute: {
    name: string;
    distanceKm: number;
    travelTimeHours: number;
    riskScore: number;
    coordinates: RouteGeometryPoint[];
    isImpassable: boolean;
  };
  recommendedRoute: {
    name: string;
    distanceKm: number;
    travelTimeHours: number;
    riskScore: number;
    coordinates: RouteGeometryPoint[];
    isAiRecommended: boolean;
    reason?: string;
  };
  explanation: string | null;
  hazardAssessment: RouteHazardAssessment;
}

export class RoutingService {
  /**
   * Compares routes for a vehicle, querying backend API or using local order detours.
   */
  async compareRoutes(
    order: DeliveryOrder,
    backendComparison: RouteComparisonDto | null = null
  ): Promise<RouteComparisonSummary> {
    const hazard = hazardService.evaluateDeliveryHazard(order);

    if (backendComparison && backendComparison.standard_route) {
      const std = backendComparison.standard_route;
      const ai = backendComparison.ai_route;

      return {
        vehicleId: order.vehicleId,
        hasPendingReroute: !!ai,
        standardRoute: {
          name: std.name || 'Standard Route',
          distanceKm: std.distance_km,
          travelTimeHours: std.travel_time_hours,
          riskScore: std.hazard_risk,
          coordinates: std.coordinates.map(([lat, lng]) => ({ lat, lng })),
          isImpassable: !!backendComparison.is_impassable,
        },
        recommendedRoute: {
          name: ai?.name || 'Safe Detour Route',
          distanceKm: ai?.distance_km ?? std.distance_km + 18,
          travelTimeHours: ai?.travel_time_hours ?? std.travel_time_hours + 0.5,
          riskScore: ai?.hazard_risk ?? 12,
          coordinates: ai
            ? ai.coordinates.map(([lat, lng]) => ({ lat, lng }))
            : order.route,
          isAiRecommended: true,
          reason: backendComparison.explanation || hazard.closureReasons[0],
        },
        explanation: backendComparison.explanation,
        hazardAssessment: hazard,
      };
    }

    // Baseline fallback using delivery order routes
    const isImpassable = !!order.dangerZone && hazard.riskScore >= 80;
    return {
      vehicleId: order.vehicleId,
      hasPendingReroute: !!order.fastestRoute && !!order.dangerZone,
      standardRoute: {
        name: 'Direct Route (Fastest)',
        distanceKm: 120,
        travelTimeHours: 2.2,
        riskScore: order.dangerZone ? 78 : 10,
        coordinates: order.fastestRoute || order.route,
        isImpassable,
      },
      recommendedRoute: {
        name: 'Safe Detour Bypass',
        distanceKm: 138,
        travelTimeHours: 2.5,
        riskScore: 14,
        coordinates: order.route,
        isAiRecommended: true,
        reason: order.dangerZone
          ? `Bypasses active ${order.dangerZone.type} danger zone.`
          : 'Optimized for current weather and terrain conditions.',
      },
      explanation: order.dangerZone
        ? `Direct route avoided due to ${order.dangerZone.type}. Recommended route adds safe buffer around hazard perimeter.`
        : null,
      hazardAssessment: hazard,
    };
  }

  /**
   * Fetches actual highway road geometry using OSRM driving service,
   * converting waypoints into high-resolution turn-by-turn road polyline coordinates.
   * If OSRM is unreachable, falls back to smooth interpolated geometry.
   */
  async fetchDetailedGeometry(
    waypoints: RouteGeometryPoint[]
  ): Promise<RouteGeometryPoint[]> {
    if (!waypoints || waypoints.length === 0) return [];
    if (waypoints.length === 1) return [...waypoints];

    try {
      const coordsString = waypoints.map(pt => `${pt.lng},${pt.lat}`).join(';');
      const url = `https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson`;

      const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (response.ok) {
        const data = await response.json();
        if (data && data.code === 'Ok' && data.routes && data.routes[0]?.geometry?.coordinates) {
          const rawCoords: [number, number][] = data.routes[0].geometry.coordinates;
          // OSRM returns [lng, lat]
          return rawCoords.map(([lng, lat]) => ({ lat, lng }));
        }
      }
    } catch {
      // Graceful fallback to interpolation if OSRM is offline
    }

    return this.interpolateWaypoints(waypoints, 15);
  }

  /**
   * Subdivides segments between waypoints with linear steps to produce smooth geometry.
   */
  interpolateWaypoints(
    waypoints: RouteGeometryPoint[],
    subdivisionsPerSegment: number = 10
  ): RouteGeometryPoint[] {
    if (waypoints.length <= 1) return [...waypoints];

    const result: RouteGeometryPoint[] = [];

    for (let i = 0; i < waypoints.length - 1; i++) {
      const p1 = waypoints[i];
      const p2 = waypoints[i + 1];

      for (let s = 0; s < subdivisionsPerSegment; s++) {
        const t = s / subdivisionsPerSegment;
        result.push({
          lat: p1.lat + (p2.lat - p1.lat) * t,
          lng: p1.lng + (p2.lng - p1.lng) * t,
        });
      }
    }

    result.push(waypoints[waypoints.length - 1]);
    return result;
  }

  /**
   * Agent guardrail:
   * Validates authorization before a route decision or reroute can be applied.
   */
  validateRerouteAuthorization(
    vehicleId: string,
    _decisionId?: number,
    authContext?: { role?: string; token?: string; isAiAgent?: boolean }
  ): { allowed: boolean; reason?: string } {
    if (!vehicleId) {
      return { allowed: false, reason: 'Vehicle ID is required for reroute authorization.' };
    }

    if (authContext?.isAiAgent && !authContext.token) {
      return {
        allowed: false,
        reason: 'Autonomous AI agents require validated dispatcher credentials to accept reroutes.',
      };
    }

    return { allowed: true };
  }
}

export const routingService = new RoutingService();
