export interface RoutePath {
  coordinates: [number, number][]; // Array of [lat, lng]
}

export interface RouteOption {
  id: string;
  name: string;
  distanceKm: number;
  etaHours: number;
  riskScore: number; // 0-100
  fuelEstimateLiters: number;
  reason?: string;
  isAiRecommended: boolean;
  path: RoutePath;
}

export interface RouteComparison {
  vehicleId: string;
  standardRoute: RouteOption;
  aiRoute: RouteOption;
}

export const MOCK_ROUTE_COMPARISON: RouteComparison = {
  vehicleId: 'TRK-8845',
  standardRoute: {
    id: 'std-1',
    name: 'NH-13 Direct',
    distanceKm: 145,
    etaHours: 3.5,
    riskScore: 68,
    fuelEstimateLiters: 42,
    isAiRecommended: false,
    path: {
      coordinates: [
        [27.0844, 93.6053], // Itanagar
        [27.2, 93.7],
        [27.4, 93.8],
        [27.55, 93.85] // Ziro (approx direct)
      ]
    }
  },
  aiRoute: {
    id: 'ai-1',
    name: 'State Highway Bypass',
    distanceKm: 162,
    etaHours: 4.1,
    riskScore: 12,
    fuelEstimateLiters: 46,
    reason: 'Rerouted: 68% landslide risk on NH-13 near Along after 6hrs rainfall',
    isAiRecommended: true,
    path: {
      coordinates: [
        [27.0844, 93.6053],
        [27.1, 93.5], // Deviation west
        [27.3, 93.55],
        [27.5, 93.7],
        [27.55, 93.85] // Ziro
      ]
    }
  }
};
