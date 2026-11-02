/**
 * Delivery Service
 * 
 * Manages pending deliveries, delivery details, grouping, and state/coordinate resolution.
 * Structured interface ready for future AI-agent integration with authorization boundaries.
 */

export type DeliveryStatus = 'Pending' | 'In Transit' | 'Delivered' | 'Delayed';

export interface DangerZoneInfo {
  center: { lat: number; lng: number };
  radius: number;
  type: string;
  severity?: 'critical' | 'high' | 'medium' | 'low';
}

export interface DeliveryOrder {
  id: string;
  vehicleId: string;
  destination: string;
  city: string;
  state: string;
  items: string;
  eta: string;
  status: DeliveryStatus;
  destinationCoords: { lat: number; lng: number };
  route: { lat: number; lng: number }[];
  fastestRoute?: { lat: number; lng: number }[];
  dangerZone?: DangerZoneInfo | null;
}

export interface DeliveryStateGroup {
  state: string;
  deliveries: DeliveryOrder[];
}

export interface AgentAuthorizationContext {
  agentId?: string;
  role?: 'driver' | 'dispatcher' | 'ai-assistant' | 'admin';
  authToken?: string;
}

/**
 * Baseline deliveries covering Northeastern Region (NER) states.
 * Preserves existing vehicle routes and detours around hazardous zones.
 */
export const INITIAL_DELIVERIES: DeliveryOrder[] = [
  {
    id: 'ORD-7732',
    vehicleId: 'TRK-9012',
    destination: 'Shillong (Meghalaya)',
    city: 'Shillong',
    state: 'Meghalaya',
    items: 'Medical Supplies',
    eta: '2H 15M',
    status: 'Pending',
    destinationCoords: { lat: 25.5788, lng: 91.8933 },
    // Route avoiding Nongpoh (dangerZone) by going West via Rani/Mairang
    route: [
      { lat: 26.1158, lng: 91.7026 }, // Guwahati
      { lat: 26.0500, lng: 91.6000 }, // Rani area detour
      { lat: 25.5600, lng: 91.6300 }, // Mairang detour
      { lat: 25.5788, lng: 91.8933 }  // Shillong
    ],
    fastestRoute: [
      { lat: 26.1158, lng: 91.7026 },
      { lat: 25.8000, lng: 91.8500 }, // Nongpoh danger zone
      { lat: 25.5788, lng: 91.8933 }
    ],
    dangerZone: { center: { lat: 25.8000, lng: 91.8500 }, radius: 5000, type: 'Flash Flood', severity: 'high' }
  },
  {
    id: 'ORD-8991',
    vehicleId: 'TRK-8845',
    destination: 'Tawang (Arunachal Pradesh)',
    city: 'Tawang',
    state: 'Arunachal Pradesh',
    items: 'Rations & Water',
    eta: '5H 40M',
    status: 'Pending',
    destinationCoords: { lat: 27.5861, lng: 91.8631 },
    // Route avoiding Bhalukpong (dangerZone) by going West via Kalaktang
    route: [
      { lat: 26.1158, lng: 91.7026 }, // Guwahati
      { lat: 27.1000, lng: 92.1100 }, // Kalaktang detour
      { lat: 27.1100, lng: 92.2600 }, // Shergaon detour
      { lat: 27.5861, lng: 91.8631 }  // Tawang
    ],
    fastestRoute: [
      { lat: 26.1158, lng: 91.7026 },
      { lat: 27.0500, lng: 92.6000 }, // Bhalukpong danger zone
      { lat: 27.5861, lng: 91.8631 }
    ],
    dangerZone: { center: { lat: 27.0500, lng: 92.6000 }, radius: 10000, type: 'Massive Landslide', severity: 'critical' }
  },
  {
    id: 'ORD-9021',
    vehicleId: 'TRK-7721',
    destination: 'Majuli (Assam)',
    city: 'Majuli',
    state: 'Assam',
    items: 'Emergency Kits',
    eta: '4H 10M',
    status: 'Pending',
    destinationCoords: { lat: 26.9500, lng: 94.1667 },
    // Route avoiding Dergaon (dangerZone) by going North of river via Tezpur/North Lakhimpur
    route: [
      { lat: 26.1158, lng: 91.7026 }, // Guwahati
      { lat: 26.6333, lng: 92.8000 }, // Tezpur detour
      { lat: 27.2333, lng: 94.1000 }, // North Lakhimpur detour
      { lat: 26.9500, lng: 94.1667 }  // Majuli
    ],
    fastestRoute: [
      { lat: 26.1158, lng: 91.7026 },
      { lat: 26.7020, lng: 93.9700 }, // Dergaon danger zone
      { lat: 26.9500, lng: 94.1667 }
    ],
    dangerZone: { center: { lat: 26.7020, lng: 93.9700 }, radius: 6000, type: 'Severe River Bank Erosion', severity: 'high' }
  },
  {
    id: 'ORD-4402',
    vehicleId: 'TRK-5534',
    destination: 'Silchar (Assam)',
    city: 'Silchar',
    state: 'Assam',
    items: 'Vaccines (Cold Chain)',
    eta: '7H 20M',
    status: 'Pending',
    destinationCoords: { lat: 24.8333, lng: 92.7789 },
    // Route avoiding East Jaintia Hills (dangerZone) by going East via Lumding/Haflong
    route: [
      { lat: 26.1158, lng: 91.7026 }, // Guwahati
      { lat: 25.7500, lng: 93.1700 }, // Lumding detour
      { lat: 25.1700, lng: 93.0200 }, // Haflong detour
      { lat: 24.8333, lng: 92.7789 }  // Silchar
    ],
    fastestRoute: [
      { lat: 26.1158, lng: 91.7026 },
      { lat: 25.5000, lng: 92.2000 }, // East Jaintia Hills danger zone
      { lat: 24.8333, lng: 92.7789 }
    ],
    dangerZone: { center: { lat: 25.5000, lng: 92.2000 }, radius: 15000, type: 'Cyclone Remnants / Heavy Storm', severity: 'critical' }
  },
  {
    id: 'ORD-5120',
    vehicleId: 'TRK-3210',
    destination: 'Kohima (Nagaland)',
    city: 'Kohima',
    state: 'Nagaland',
    items: 'Relief Food Packages',
    eta: '3H 30M',
    status: 'Pending',
    destinationCoords: { lat: 25.6701, lng: 94.1077 },
    route: [
      { lat: 26.1158, lng: 91.7026 },
      { lat: 26.2000, lng: 92.9000 },
      { lat: 25.8500, lng: 93.7000 },
      { lat: 25.6701, lng: 94.1077 }
    ],
    fastestRoute: [
      { lat: 26.1158, lng: 91.7026 },
      { lat: 25.9000, lng: 93.7500 },
      { lat: 25.6701, lng: 94.1077 }
    ],
    dangerZone: { center: { lat: 25.9000, lng: 93.7500 }, radius: 4500, type: 'Active Mudslide Blockage', severity: 'high' }
  },
  {
    id: 'ORD-6214',
    vehicleId: 'TRK-4091',
    destination: 'Imphal (Manipur)',
    city: 'Imphal',
    state: 'Manipur',
    items: 'Emergency Power Inverters',
    eta: '6H 15M',
    status: 'Pending',
    destinationCoords: { lat: 24.8170, lng: 93.9368 },
    route: [
      { lat: 26.1158, lng: 91.7026 },
      { lat: 25.8000, lng: 93.2000 },
      { lat: 25.1000, lng: 93.6000 },
      { lat: 24.8170, lng: 93.9368 }
    ],
    fastestRoute: [
      { lat: 26.1158, lng: 91.7026 },
      { lat: 25.0500, lng: 93.8000 },
      { lat: 24.8170, lng: 93.9368 }
    ],
    dangerZone: { center: { lat: 25.0500, lng: 93.8000 }, radius: 5500, type: 'Valley Rockfall Hazard', severity: 'medium' }
  },
  {
    id: 'ORD-3389',
    vehicleId: 'TRK-6152',
    destination: 'Aizawl (Mizoram)',
    city: 'Aizawl',
    state: 'Mizoram',
    items: 'Shelter Tarpaulins & Tools',
    eta: '8H 10M',
    status: 'Pending',
    destinationCoords: { lat: 23.7271, lng: 92.7176 },
    route: [
      { lat: 26.1158, lng: 91.7026 },
      { lat: 25.1000, lng: 92.8000 },
      { lat: 24.2000, lng: 92.7000 },
      { lat: 23.7271, lng: 92.7176 }
    ],
    fastestRoute: [
      { lat: 26.1158, lng: 91.7026 },
      { lat: 24.1500, lng: 92.7200 },
      { lat: 23.7271, lng: 92.7176 }
    ],
    dangerZone: { center: { lat: 24.1500, lng: 92.7200 }, radius: 7000, type: 'Debris Flow Inundation', severity: 'high' }
  },
  {
    id: 'ORD-2105',
    vehicleId: 'TRK-1980',
    destination: 'Agartala (Tripura)',
    city: 'Agartala',
    state: 'Tripura',
    items: 'Water Purification Filters',
    eta: '7H 45M',
    status: 'Pending',
    destinationCoords: { lat: 23.8315, lng: 91.2868 },
    route: [
      { lat: 26.1158, lng: 91.7026 },
      { lat: 25.2000, lng: 92.2000 },
      { lat: 24.3000, lng: 91.8000 },
      { lat: 23.8315, lng: 91.2868 }
    ],
    fastestRoute: [
      { lat: 26.1158, lng: 91.7026 },
      { lat: 24.3500, lng: 91.9000 },
      { lat: 23.8315, lng: 91.2868 }
    ],
    dangerZone: { center: { lat: 24.3500, lng: 91.9000 }, radius: 8000, type: 'Flash Flooding & Washout', severity: 'critical' }
  },
  {
    id: 'ORD-1844',
    vehicleId: 'TRK-7402',
    destination: 'Gangtok (Sikkim)',
    city: 'Gangtok',
    state: 'Sikkim',
    items: 'Hospital Pharmaceuticals',
    eta: '4H 50M',
    status: 'Pending',
    destinationCoords: { lat: 27.3389, lng: 88.6065 },
    route: [
      { lat: 26.1158, lng: 91.7026 },
      { lat: 26.5000, lng: 90.0000 },
      { lat: 27.0000, lng: 88.8000 },
      { lat: 27.3389, lng: 88.6065 }
    ],
    fastestRoute: [
      { lat: 26.1158, lng: 91.7026 },
      { lat: 27.1000, lng: 88.6500 },
      { lat: 27.3389, lng: 88.6065 }
    ],
    dangerZone: { center: { lat: 27.1000, lng: 88.6500 }, radius: 6000, type: 'Glacial Stream Overflow', severity: 'high' }
  }
];

export class DeliveryService {
  private deliveries: DeliveryOrder[] = [...INITIAL_DELIVERIES];

  /**
   * Returns all pending deliveries.
   */
  getPendingDeliveries(): DeliveryOrder[] {
    return this.deliveries.filter(d => d.status === 'Pending');
  }

  /**
   * Returns all deliveries regardless of status.
   */
  getAllDeliveries(): DeliveryOrder[] {
    return [...this.deliveries];
  }

  /**
   * Retrieves a single delivery by ID.
   */
  getDeliveryById(id: string): DeliveryOrder | undefined {
    return this.deliveries.find(d => d.id === id);
  }

  /**
   * Extracts city and state from a destination string like "Shillong (Meghalaya)".
   */
  extractStateAndCity(destination: string): { city: string; state: string } {
    const match = destination.match(/^([^()]+)\s*(?:\(([^()]+)\))?/);
    if (match) {
      const city = match[1]?.trim() || destination;
      let state = match[2]?.trim() || '';
      // Normalization for short names like "Arunachal" -> "Arunachal Pradesh"
      if (state.toLowerCase() === 'arunachal') state = 'Arunachal Pradesh';
      return { city, state };
    }
    return { city: destination, state: '' };
  }

  /**
   * Returns destination coordinates for a delivery.
   */
  getDestinationCoordinates(delivery: DeliveryOrder): { lat: number; lng: number } {
    if (delivery.destinationCoords) return delivery.destinationCoords;
    const lastPoint = delivery.route[delivery.route.length - 1];
    return lastPoint ? { lat: lastPoint.lat, lng: lastPoint.lng } : { lat: 26.1158, lng: 91.7026 };
  }

  /**
   * Groups deliveries by destination state, sorts state groups alphabetically,
   * and sorts deliveries within each state alphabetically by destination.
   */
  groupDeliveriesByState(deliveries: DeliveryOrder[] = this.deliveries): DeliveryStateGroup[] {
    const map = new Map<string, DeliveryOrder[]>();

    for (const order of deliveries) {
      const stateName = order.state || this.extractStateAndCity(order.destination).state || 'Other';
      if (!map.has(stateName)) {
        map.set(stateName, []);
      }
      map.get(stateName)!.push(order);
    }

    const sortedStates = Array.from(map.keys()).sort((a, b) => a.localeCompare(b));

    return sortedStates.map(state => {
      const groupDeliveries = map.get(state) || [];
      const sortedDeliveries = [...groupDeliveries].sort((a, b) =>
        a.destination.localeCompare(b.destination)
      );
      return {
        state,
        deliveries: sortedDeliveries,
      };
    });
  }

  /**
   * Filter deliveries by state, status, or search query.
   */
  filterDeliveries(
    deliveries: DeliveryOrder[] = this.deliveries,
    criteria: { state?: string; status?: DeliveryStatus; search?: string }
  ): DeliveryOrder[] {
    return deliveries.filter(d => {
      if (criteria.state && d.state.toLowerCase() !== criteria.state.toLowerCase()) {
        return false;
      }
      if (criteria.status && d.status !== criteria.status) {
        return false;
      }
      if (criteria.search) {
        const query = criteria.search.toLowerCase();
        const matches =
          d.id.toLowerCase().includes(query) ||
          d.destination.toLowerCase().includes(query) ||
          d.items.toLowerCase().includes(query);
        if (!matches) return false;
      }
      return true;
    });
  }

  /**
   * Guardrail interface for AI Agent:
   * Prevents unauthorized automatic modification of delivery status.
   * Requires explicit dispatcher/driver role or validated authorization.
   */
  validateDeliveryStatusUpdate(
    deliveryId: string,
    targetStatus: DeliveryStatus,
    authContext?: AgentAuthorizationContext
  ): { allowed: boolean; reason?: string } {
    const delivery = this.getDeliveryById(deliveryId);
    if (!delivery) {
      return { allowed: false, reason: `Delivery '${deliveryId}' not found.` };
    }

    // AI Agents cannot mark deliveries complete or reassign without explicit dispatcher credentials
    if (authContext?.role === 'ai-assistant' && !authContext.authToken) {
      return {
        allowed: false,
        reason: 'Autonomous AI agents must have explicit dispatcher authorization to alter delivery status.',
      };
    }

    if (delivery.status === targetStatus) {
      return { allowed: true };
    }

    return { allowed: true };
  }
}

export const deliveryService = new DeliveryService();
