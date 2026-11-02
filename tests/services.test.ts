import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  deliveryService,
  INITIAL_DELIVERIES,
} from '../src/services/deliveryService.ts';
import {
  weatherService,
  NER_STATE_MAPPINGS,
} from '../src/services/weatherService.ts';
import { hazardService } from '../src/services/hazardService.ts';
import { routingService } from '../src/services/routingService.ts';
import { SimulationService } from '../src/services/simulationService.ts';

describe('Delivery Service', () => {
  test('should return all pending deliveries', () => {
    const pending = deliveryService.getPendingDeliveries();
    assert.ok(pending.length > 0);
    pending.forEach(d => assert.strictEqual(d.status, 'Pending'));
  });

  test('should extract state and city from destination strings', () => {
    const res1 = deliveryService.extractStateAndCity('Shillong (Meghalaya)');
    assert.strictEqual(res1.city, 'Shillong');
    assert.strictEqual(res1.state, 'Meghalaya');

    const res2 = deliveryService.extractStateAndCity('Tawang (Arunachal)');
    assert.strictEqual(res2.city, 'Tawang');
    assert.strictEqual(res2.state, 'Arunachal Pradesh');

    const res3 = deliveryService.extractStateAndCity('Guwahati');
    assert.strictEqual(res3.city, 'Guwahati');
    assert.strictEqual(res3.state, '');
  });

  test('should group deliveries by state alphabetically and sort deliveries within groups', () => {
    const groups = deliveryService.groupDeliveriesByState();
    assert.ok(groups.length > 0);

    // Verify state groups are sorted alphabetically
    for (let i = 0; i < groups.length - 1; i++) {
      assert.ok(
        groups[i].state.localeCompare(groups[i + 1].state) <= 0,
        `States should be alphabetical: ${groups[i].state} <= ${groups[i + 1].state}`
      );
    }

    // Verify deliveries within each group are sorted by destination
    groups.forEach(group => {
      for (let j = 0; j < group.deliveries.length - 1; j++) {
        assert.ok(
          group.deliveries[j].destination.localeCompare(group.deliveries[j + 1].destination) <= 0,
          `Deliveries in ${group.state} should be sorted by destination`
        );
      }
    });

    // In Assam, Majuli should come before Silchar
    const assamGroup = groups.find(g => g.state === 'Assam');
    assert.ok(assamGroup, 'Assam group should exist');
    assert.strictEqual(assamGroup.deliveries[0].destination, 'Majuli (Assam)');
    assert.strictEqual(assamGroup.deliveries[1].destination, 'Silchar (Assam)');
  });

  test('enforces agent authorization guardrails on delivery status changes', () => {
    const firstId = INITIAL_DELIVERIES[0].id;

    // Unauthorized AI Agent attempt
    const blocked = deliveryService.validateDeliveryStatusUpdate(firstId, 'Delivered', {
      role: 'ai-assistant',
    });
    assert.strictEqual(blocked.allowed, false);
    assert.ok(blocked.reason?.includes('dispatcher authorization'));

    // Authorized dispatcher attempt
    const allowed = deliveryService.validateDeliveryStatusUpdate(firstId, 'Delivered', {
      role: 'ai-assistant',
      authToken: 'disp-auth-token-123',
    });
    assert.strictEqual(allowed.allowed, true);
  });
});

describe('Weather Service', () => {
  beforeEach(() => {
    weatherService.clearCache();
  });

  test('correctly maps WMO weather codes to descriptions and icons', () => {
    const clear = weatherService.interpretWmoCode(0);
    assert.strictEqual(clear.condition, 'Clear Sky');
    assert.strictEqual(clear.iconType, 'Sun');

    const rain = weatherService.interpretWmoCode(61);
    assert.strictEqual(rain.condition, 'Rain');
    assert.strictEqual(rain.iconType, 'CloudRain');

    const thunder = weatherService.interpretWmoCode(95);
    assert.strictEqual(thunder.condition, 'Thunderstorm');
    assert.strictEqual(thunder.iconType, 'CloudLightning');
  });

  test('contains mappings for all 8 Northeastern Region states', () => {
    const requiredStates = [
      'meghalaya',
      'arunachal pradesh',
      'assam',
      'nagaland',
      'manipur',
      'mizoram',
      'tripura',
      'sikkim',
    ];

    requiredStates.forEach(st => {
      assert.ok(NER_STATE_MAPPINGS[st], `Mapping should exist for state ${st}`);
      assert.ok(NER_STATE_MAPPINGS[st].city, `City should exist for ${st}`);
      assert.ok(typeof NER_STATE_MAPPINGS[st].lat === 'number');
      assert.ok(typeof NER_STATE_MAPPINGS[st].lng === 'number');
    });
  });

  test('weather caching avoids unnecessary API calls for same state', async () => {
    let callCount = 0;
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async () => {
      callCount++;
      return {
        ok: true,
        json: async () => ({
          current: { temperature_2m: 19.5, weather_code: 3 },
        }),
      } as any;
    }) as any;

    try {
      // First call fetches from Open-Meteo
      const w1 = await weatherService.getWeatherForState('Meghalaya');
      assert.strictEqual(w1.temperature, 19.5);
      assert.strictEqual(callCount, 1);

      // Second call for same state should use in-memory cache
      const w2 = await weatherService.getWeatherForState('Meghalaya');
      assert.strictEqual(w2.temperature, 19.5);
      assert.strictEqual(callCount, 1, 'Subsequent call within TTL should NOT hit fetch again');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('supports coordinate-based queries for future localized disaster prediction', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return {
        ok: true,
        json: async () => ({
          current: { temperature_2m: 16.0, weather_code: 61 },
        }),
      } as any;
    }) as any;

    try {
      const coordWeather = await weatherService.getWeatherForCoordinates(25.5788, 91.8933, {
        city: 'Shillong',
        state: 'Meghalaya',
      });
      assert.strictEqual(coordWeather.city, 'Shillong');
      assert.strictEqual(coordWeather.temperature, 16.0);
      assert.strictEqual(coordWeather.condition, 'Rain');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('Hazard Service', () => {
  test('evaluates hazard risks for delivery orders with danger zones', () => {
    const orderWithHazard = INITIAL_DELIVERIES[0]; // Meghalaya order with flash flood
    const evaluation = hazardService.evaluateDeliveryHazard(orderWithHazard);

    assert.strictEqual(evaluation.hasHazard, true);
    assert.strictEqual(evaluation.hazardType, 'Flash Flood');
    assert.strictEqual(evaluation.riskLevel, 'high');
    assert.ok(evaluation.riskScore >= 70);
    assert.ok(evaluation.contributingFactors.length > 0);
  });

  test('evaluates clear routes when no danger zone is present', () => {
    const clearOrder = {
      ...INITIAL_DELIVERIES[0],
      dangerZone: null,
    };
    const evaluation = hazardService.evaluateDeliveryHazard(clearOrder);

    assert.strictEqual(evaluation.hasHazard, false);
    assert.strictEqual(evaluation.riskLevel, 'low');
    assert.strictEqual(evaluation.isImpassable, false);
  });

  test('validates blockage reports with agent authorization guardrails', () => {
    // Missing required fields
    const invalid = hazardService.validateBlockageReport({
      type: '',
      severity: 'high',
      lat: 0,
      lng: 0,
    });
    assert.strictEqual(invalid.valid, false);

    // AI Agent without dispatcher token
    const unauthorizedAi = hazardService.validateBlockageReport(
      {
        type: 'Landslide',
        severity: 'critical',
        lat: 26.1158,
        lng: 91.7026,
      },
      { isAiAgent: true }
    );
    assert.strictEqual(unauthorizedAi.valid, true);
    assert.strictEqual(unauthorizedAi.authorized, false);
    assert.ok(unauthorizedAi.reason?.includes('token validation'));
  });
});

describe('Routing Service', () => {
  test('interpolates waypoints into smooth fine-grained geometry when offline', () => {
    const waypoints = [
      { lat: 26.0, lng: 91.0 },
      { lat: 27.0, lng: 92.0 },
    ];
    const interpolated = routingService.interpolateWaypoints(waypoints, 5);

    assert.strictEqual(interpolated.length, 6);
    assert.strictEqual(interpolated[0].lat, 26.0);
    assert.strictEqual(interpolated[interpolated.length - 1].lat, 27.0);
  });

  test('enforces reroute authorization guardrails', () => {
    const blocked = routingService.validateRerouteAuthorization('TRK-9012', 1, {
      isAiAgent: true,
    });
    assert.strictEqual(blocked.allowed, false);

    const allowed = routingService.validateRerouteAuthorization('TRK-9012', 1, {
      isAiAgent: true,
      token: 'disp-reroute-token',
    });
    assert.strictEqual(allowed.allowed, true);
  });
});

describe('Simulation Service', () => {
  test('manages simulation lifecycle, states, and progress', () => {
    const sim = new SimulationService([
      { lat: 26.0, lng: 91.0 },
      { lat: 26.5, lng: 91.5 },
      { lat: 27.0, lng: 92.0 },
    ]);

    let initialState = sim.getState();
    assert.strictEqual(initialState.status, 'idle');
    assert.strictEqual(initialState.progressPercent, 0);
    assert.strictEqual(initialState.deliveryReached, false);
    assert.strictEqual(initialState.totalPoints, 3);

    // Pause
    sim.start();
    assert.strictEqual(sim.getState().status, 'running');

    sim.pause();
    assert.strictEqual(sim.getState().status, 'paused');

    sim.resume();
    assert.strictEqual(sim.getState().status, 'running');

    sim.reset();
    assert.strictEqual(sim.getState().status, 'idle');
    assert.strictEqual(sim.getState().progressPercent, 0);

    sim.destroy();
  });
});
