export interface WeatherPoint {
  lat: number;
  lng: number;
  rainfallMm: number;
  cloudCover: number;
}

export const MOCK_WEATHER_DATA: WeatherPoint[] = [
  { lat: 26.1158, lng: 91.7026, rainfallMm: 12, cloudCover: 80 }, // Guwahati
  { lat: 27.0844, lng: 93.6053, rainfallMm: 45, cloudCover: 100 }, // Itanagar
  { lat: 24.8333, lng: 92.7789, rainfallMm: 28, cloudCover: 90 }, // Silchar
  { lat: 23.7271, lng: 92.7176, rainfallMm: 5, cloudCover: 40 }, // Aizawl
];
