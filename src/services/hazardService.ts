/**
 * Hazard Service
 * 
 * Manages hazard assessment, risk calculations, affected routes/locations,
 * and blockage validation boundaries for future AI-agent interactions.
 */

import { mossamApi, type PredictiveHazardEstimateDto, type BlockageReportInput } from './api.ts';
import type { DeliveryOrder, DangerZoneInfo } from './deliveryService.ts';

export type HazardRiskLevel = 'low' | 'medium' | 'high' | 'critical' | 'unknown';

export interface RouteHazardAssessment {
  hasHazard: boolean;
  hazardType?: string;
  riskLevel: HazardRiskLevel;
  riskScore: number; // 0 to 100
  affectedZone?: DangerZoneInfo | null;
  contributingFactors: string[];
  dataFreshness: 'fresh' | 'stale' | 'simulated';
  isImpassable: boolean;
  closureReasons: string[];
  timestamp: string;
}

export interface BlockageValidationResult {
  valid: boolean;
  errors?: string[];
  authorized: boolean;
  reason?: string;
}

export class HazardService {
  /**
   * Evaluates hazard exposure for a delivery order.
   */
  evaluateDeliveryHazard(order: DeliveryOrder): RouteHazardAssessment {
    if (!order.dangerZone) {
      return {
        hasHazard: false,
        riskLevel: 'low',
        riskScore: 8,
        contributingFactors: ['Clear highway corridor', 'No active weather warnings'],
        dataFreshness: 'fresh',
        isImpassable: false,
        closureReasons: [],
        timestamp: new Date().toISOString(),
      };
    }

    const { type, severity = 'high', center, radius } = order.dangerZone;
    let score = 65;
    if (severity === 'critical') score = 92;
    else if (severity === 'high') score = 75;
    else if (severity === 'medium') score = 45;
    else if (severity === 'low') score = 25;

    const factors = [
      `Monsoon activity in vicinity: ${type}`,
      `Active hazard radius: ${(radius / 1000).toFixed(1)} km`,
      `Hazard center: ${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`,
      `Geographic zone: near ${order.destination}`,
    ];

    return {
      hasHazard: true,
      hazardType: type,
      riskLevel: severity,
      riskScore: score,
      affectedZone: order.dangerZone,
      contributingFactors: factors,
      dataFreshness: 'fresh',
      isImpassable: score >= 85,
      closureReasons: score >= 85 ? [`Route passes directly through ${type}`] : [],
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Fetches backend predictive hazard estimate for a route if available.
   */
  async fetchRoutePredictiveHazard(routeId: string, horizon: string = '3h'): Promise<PredictiveHazardEstimateDto | null> {
    try {
      return await mossamApi.getRouteHazard(routeId, horizon);
    } catch {
      return null;
    }
  }

  /**
   * Helper to calculate whether a point is within radius meters of a center point.
   */
  private isPointInCircle(
    point: { lat: number; lng: number },
    center: { lat: number; lng: number },
    radiusMeters: number
  ): boolean {
    const R = 6371e3; // Earth radius in meters
    const phi1 = (point.lat * Math.PI) / 180;
    const phi2 = (center.lat * Math.PI) / 180;
    const deltaPhi = ((center.lat - point.lat) * Math.PI) / 180;
    const deltaLambda = ((center.lng - point.lng) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c;

    return d <= radiusMeters;
  }

  /**
   * Checks whether any coordinate along a route intersects an active danger zone.
   */
  checkRouteIntersection(
    route: { lat: number; lng: number }[],
    dangerZone: DangerZoneInfo
  ): boolean {
    return route.some(pt => this.isPointInCircle(pt, dangerZone.center, dangerZone.radius));
  }

  /**
   * Agent authorization and validation guardrail for reporting road blockages.
   * Future AI agents or human drivers must submit valid telemetry and pass authorization.
   */
  validateBlockageReport(
    report: BlockageReportInput,
    authContext?: { role?: string; token?: string; isAiAgent?: boolean }
  ): BlockageValidationResult {
    const errors: string[] = [];

    if (!report.type || report.type.trim() === '') {
      errors.push('Blockage type is required.');
    }
    if (typeof report.lat !== 'number' || typeof report.lng !== 'number') {
      errors.push('Valid latitude and longitude are required.');
    }
    if (report.lat < 21 || report.lat > 30 || report.lng < 88 || report.lng > 98) {
      errors.push('Coordinates must fall within the Northeastern Region (NER) operational boundary.');
    }

    if (errors.length > 0) {
      return { valid: false, errors, authorized: false };
    }

    // AI Agents submitting blockage reports require verification flag or dispatcher sign-off
    if (authContext?.isAiAgent && !authContext.token) {
      return {
        valid: true,
        authorized: false,
        reason: 'Automated AI blockage reporting requires dispatcher token validation.',
      };
    }

    return { valid: true, authorized: true };
  }
}

export const hazardService = new HazardService();
