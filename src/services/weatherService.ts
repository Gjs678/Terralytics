/**
 * Weather Service
 * 
 * Provides structured weather fetching, caching, state-to-city resolution,
 * and exact destination coordinate weather support via Open-Meteo.
 * Decoupled from React UI components and accessible to future AI agents.
 */

export interface WeatherLocationMapping {
  state: string;
  city: string;
  lat: number;
  lng: number;
}

export interface WeatherInfo {
  state: string;
  city: string;
  lat: number;
  lng: number;
  temperature: number;
  weatherCode: number;
  condition: string;
  iconType: 'Sun' | 'Cloud' | 'CloudRain' | 'CloudLightning' | 'CloudSnow' | 'CloudFog';
  iconColor: string;
  timestamp: string;
  isStale?: boolean;
}

export interface WeatherQueryOptions {
  state?: string | null;
  city?: string | null;
  coordinates?: { lat: number; lng: number } | null;
  bypassCache?: boolean;
}

/**
 * Standard Northeastern Region (NER) state capital mapping.
 */
export const NER_STATE_MAPPINGS: Record<string, WeatherLocationMapping> = {
  'meghalaya': { state: 'Meghalaya', city: 'Shillong', lat: 25.5788, lng: 91.8933 },
  'arunachal pradesh': { state: 'Arunachal Pradesh', city: 'Itanagar', lat: 27.1004, lng: 93.6166 },
  'arunachal': { state: 'Arunachal Pradesh', city: 'Itanagar', lat: 27.1004, lng: 93.6166 },
  'assam': { state: 'Assam', city: 'Guwahati', lat: 26.1445, lng: 91.7362 },
  'nagaland': { state: 'Nagaland', city: 'Kohima', lat: 25.6701, lng: 94.1077 },
  'manipur': { state: 'Manipur', city: 'Imphal', lat: 24.8170, lng: 93.9368 },
  'mizoram': { state: 'Mizoram', city: 'Aizawl', lat: 23.7271, lng: 92.7176 },
  'tripura': { state: 'Tripura', city: 'Agartala', lat: 23.8315, lng: 91.2868 },
  'sikkim': { state: 'Sikkim', city: 'Gangtok', lat: 27.3389, lng: 88.6065 }
};

interface CacheEntry {
  data: WeatherInfo;
  fetchedAt: number;
}

export class WeatherService {
  private cache = new Map<string, CacheEntry>();
  // 5 minutes TTL to avoid excessive network requests
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;

  /**
   * Resolves WMO weather interpretation code to label, icon, and color.
   */
  interpretWmoCode(code: number): {
    condition: string;
    iconType: WeatherInfo['iconType'];
    iconColor: string;
  } {
    if (code === 0) {
      return { condition: 'Clear Sky', iconType: 'Sun', iconColor: 'text-amber-500' };
    }
    if (code <= 3) {
      return { condition: 'Cloudy', iconType: 'Cloud', iconColor: 'text-monsoon-400' };
    }
    if (code === 45 || code === 48) {
      return { condition: 'Fog', iconType: 'CloudFog', iconColor: 'text-monsoon-300' };
    }
    if (code >= 51 && code <= 67) {
      return { condition: 'Rain', iconType: 'CloudRain', iconColor: 'text-blue-500' };
    }
    if (code >= 71 && code <= 77) {
      return { condition: 'Snow', iconType: 'CloudSnow', iconColor: 'text-blue-300' };
    }
    if (code >= 80 && code <= 82) {
      return { condition: 'Showers', iconType: 'CloudRain', iconColor: 'text-blue-500' };
    }
    if (code >= 95 && code <= 99) {
      return { condition: 'Thunderstorm', iconType: 'CloudLightning', iconColor: 'text-terracotta-500' };
    }
    return { condition: 'Cloudy', iconType: 'Cloud', iconColor: 'text-monsoon-400' };
  }

  /**
   * Normalizes state name string for key lookup.
   */
  private normalizeStateKey(state: string): string {
    return state.trim().toLowerCase();
  }

  /**
   * Generates a cache key based on query options.
   */
  private getCacheKey(options: WeatherQueryOptions): string {
    if (options.coordinates) {
      return `coord:${options.coordinates.lat.toFixed(2)},${options.coordinates.lng.toFixed(2)}`;
    }
    if (options.state) {
      return `state:${this.normalizeStateKey(options.state)}`;
    }
    if (options.city) {
      return `city:${options.city.trim().toLowerCase()}`;
    }
    return 'state:assam';
  }

  /**
   * Fetches weather information using Open-Meteo API.
   * Handles caching, coordinate vs state resolution, and network fallback.
   */
  async fetchWeather(options: WeatherQueryOptions): Promise<WeatherInfo> {
    const cacheKey = this.getCacheKey(options);
    const cached = this.cache.get(cacheKey);
    const now = Date.now();

    // Return cached value if within TTL and cache bypass is not requested
    if (cached && !options.bypassCache && (now - cached.fetchedAt < this.CACHE_TTL_MS)) {
      return cached.data;
    }

    // Determine target coordinates and labels
    let targetLat = 26.1445; // Default: Guwahati
    let targetLng = 91.7362;
    let targetState = 'Assam';
    let targetCity = 'Guwahati';

    if (options.coordinates) {
      targetLat = options.coordinates.lat;
      targetLng = options.coordinates.lng;
      targetCity = options.city || 'Destination';
      targetState = options.state || '';
    } else if (options.state) {
      const normalized = this.normalizeStateKey(options.state);
      const mapping = NER_STATE_MAPPINGS[normalized];
      if (mapping) {
        targetLat = mapping.lat;
        targetLng = mapping.lng;
        targetState = mapping.state;
        targetCity = mapping.city;
      } else {
        targetState = options.state;
        targetCity = options.city || options.state;
      }
    }

    const endpoint = `https://api.open-meteo.com/v1/forecast?latitude=${targetLat}&longitude=${targetLng}&current=temperature_2m,weather_code&timezone=auto`;

    try {
      const response = await fetch(endpoint);
      if (!response.ok) {
        throw new Error(`Open-Meteo returned status ${response.status}`);
      }

      const json = await response.json();
      const temp = json?.current?.temperature_2m ?? 24;
      const code = json?.current?.weather_code ?? 0;
      const details = this.interpretWmoCode(code);

      const result: WeatherInfo = {
        state: targetState,
        city: targetCity,
        lat: targetLat,
        lng: targetLng,
        temperature: temp,
        weatherCode: code,
        condition: details.condition,
        iconType: details.iconType,
        iconColor: details.iconColor,
        timestamp: new Date().toISOString(),
        isStale: false,
      };

      // Store in cache
      this.cache.set(cacheKey, { data: result, fetchedAt: now });
      return result;
    } catch {
      // If network fails, serve stale cache if available
      if (cached) {
        return {
          ...cached.data,
          isStale: true,
        };
      }

      // If no cache exists, construct structured fallback response rather than crashing
      const fallbackDetails = this.interpretWmoCode(1);
      return {
        state: targetState,
        city: targetCity,
        lat: targetLat,
        lng: targetLng,
        temperature: 22,
        weatherCode: 1,
        condition: 'Partly Cloudy (Cached)',
        iconType: fallbackDetails.iconType,
        iconColor: fallbackDetails.iconColor,
        timestamp: new Date().toISOString(),
        isStale: true,
      };
    }
  }

  /**
   * Convenience method to fetch weather by state name.
   */
  async getWeatherForState(stateName: string): Promise<WeatherInfo> {
    return this.fetchWeather({ state: stateName });
  }

  /**
   * Future-proof coordinate weather query for localized disaster evaluation.
   */
  async getWeatherForCoordinates(
    lat: number,
    lng: number,
    context?: { state?: string; city?: string }
  ): Promise<WeatherInfo> {
    return this.fetchWeather({
      coordinates: { lat, lng },
      state: context?.state,
      city: context?.city,
    });
  }

  /**
   * Clears the in-memory weather cache.
   */
  clearCache(): void {
    this.cache.clear();
  }
}

export const weatherService = new WeatherService();
