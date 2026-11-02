import React, { useEffect, useState } from 'react';
import { Sun, Cloud, CloudRain, CloudLightning, CloudSnow, CloudFog, Loader2, ChevronDown, MapPin } from 'lucide-react';
import { weatherService, type WeatherInfo } from '../../services/weatherService';

interface WeatherWidgetProps {
  compact?: boolean;
  selectedState?: string | null;
  selectedCity?: string | null;
  selectedCoordinates?: { lat: number; lng: number } | null;
}

const NER_STATES_LIST = [
  { name: 'Assam (Guwahati)', state: 'Assam', city: 'Guwahati' },
  { name: 'Meghalaya (Shillong)', state: 'Meghalaya', city: 'Shillong' },
  { name: 'Arunachal Pradesh (Itanagar)', state: 'Arunachal Pradesh', city: 'Itanagar' },
  { name: 'Nagaland (Kohima)', state: 'Nagaland', city: 'Kohima' },
  { name: 'Manipur (Imphal)', state: 'Manipur', city: 'Imphal' },
  { name: 'Mizoram (Aizawl)', state: 'Mizoram', city: 'Aizawl' },
  { name: 'Tripura (Agartala)', state: 'Tripura', city: 'Agartala' },
  { name: 'Sikkim (Gangtok)', state: 'Sikkim', city: 'Gangtok' },
];

export const WeatherWidget: React.FC<WeatherWidgetProps> = ({
  compact = false,
  selectedState,
  selectedCity,
  selectedCoordinates,
}) => {
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manualIndex, setManualIndex] = useState(0);

  // Determine query parameters based on props or manual selection
  const activeState = selectedState || NER_STATES_LIST[manualIndex]?.state;
  const activeCity = selectedCity || NER_STATES_LIST[manualIndex]?.city;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    weatherService
      .fetchWeather({
        state: activeState,
        city: activeCity,
        coordinates: selectedCoordinates,
      })
      .then(info => {
        if (!cancelled) {
          setWeather(info);
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err?.message || 'Weather unavailable');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeState, activeCity, selectedCoordinates]);

  const renderWeatherIcon = (type: WeatherInfo['iconType'], colorClass: string, size: number) => {
    switch (type) {
      case 'Sun':
        return <Sun size={size} className={colorClass} />;
      case 'Cloud':
        return <Cloud size={size} className={colorClass} />;
      case 'CloudRain':
        return <CloudRain size={size} className={colorClass} />;
      case 'CloudLightning':
        return <CloudLightning size={size} className={colorClass} />;
      case 'CloudSnow':
        return <CloudSnow size={size} className={colorClass} />;
      case 'CloudFog':
        return <CloudFog size={size} className={colorClass} />;
      default:
        return <Cloud size={size} className={colorClass} />;
    }
  };

  if (loading && !weather) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg border ${
          compact
            ? 'bg-white/80 backdrop-blur-md border-monsoon-100 shadow-sm px-3 py-1.5'
            : 'bg-monsoon-900 border-monsoon-800 p-4 h-full'
        }`}
      >
        <Loader2 className="animate-spin text-moss-500" size={compact ? 16 : 24} />
      </div>
    );
  }

  if (error && !weather) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg border text-xs text-center ${
          compact
            ? 'bg-white/80 backdrop-blur-md border-monsoon-100 shadow-sm text-monsoon-600 px-3 py-1.5'
            : 'bg-monsoon-900 border-monsoon-800 text-monsoon-400 p-4 h-full'
        }`}
      >
        <span>Weather unavail.</span>
      </div>
    );
  }

  const weatherData = weather || {
    state: activeState || 'Assam',
    city: activeCity || 'Guwahati',
    temperature: 24,
    condition: 'Clear Sky',
    iconType: 'Sun' as const,
    iconColor: 'text-amber-500',
    weatherCode: 0,
    lat: 26.1445,
    lng: 91.7362,
    timestamp: '',
    isStale: false,
  };

  if (compact) {
    return (
      <div
        className="relative flex items-center gap-2 bg-white/90 backdrop-blur-md rounded-full px-3 py-1.5 border border-monsoon-200 shadow-sm animate-fade-in hover:shadow-md transition-shadow group"
        title={`${weatherData.city}, ${weatherData.state}: ${weatherData.condition} (${Math.round(weatherData.temperature)}°C)${weatherData.isStale ? ' (Stale)' : ''}`}
      >
        {renderWeatherIcon(weatherData.iconType, weatherData.iconColor, 16)}
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-monsoon-900 text-sm">
            {Math.round(weatherData.temperature)}°C
          </span>
          <span className="hidden sm:inline-block text-xs font-medium text-monsoon-600 truncate max-w-[140px]">
            {weatherData.city}
          </span>
        </div>

        {/* If no delivery is selected, allow interactive dropdown */}
        {!selectedState && (
          <>
            <ChevronDown size={14} className="text-monsoon-600 group-hover:text-monsoon-900 transition-colors" />
            <select
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              value={manualIndex}
              onChange={e => setManualIndex(Number(e.target.value))}
              title="Select Location"
            >
              {NER_STATES_LIST.map((item, idx) => (
                <option key={idx} value={idx} className="text-monsoon-900 bg-white">
                  {item.name}
                </option>
              ))}
            </select>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between bg-monsoon-900 rounded-lg border border-monsoon-800 p-4 h-full animate-fade-in relative group">
      <div>
        <div className="flex items-center gap-1 mb-1">
          {selectedState ? (
            <div className="flex items-center gap-1 text-sm font-semibold text-monsoon-200">
              <MapPin size={13} className="text-moss-400" />
              <span>
                {weatherData.city}, {weatherData.state}
              </span>
            </div>
          ) : (
            <div className="relative flex items-center">
              <select
                className="text-sm font-semibold text-monsoon-300 bg-transparent border-none outline-none cursor-pointer appearance-none hover:text-moss-300 transition-colors pr-5 relative z-10"
                value={manualIndex}
                onChange={e => setManualIndex(Number(e.target.value))}
              >
                {NER_STATES_LIST.map((item, idx) => (
                  <option key={idx} value={idx} className="text-monsoon-900 bg-white">
                    {item.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="text-monsoon-400 pointer-events-none -ml-4" />
            </div>
          )}
        </div>
        <div className="flex items-end gap-2">
          <span className="text-3xl font-semibold text-monsoon-50 tracking-tight">
            {Math.round(weatherData.temperature)}°C
          </span>
          <span className={`text-sm font-medium mb-1 ${weatherData.iconColor}`}>
            {weatherData.condition}
          </span>
        </div>
      </div>
      <div className={`p-3 rounded-full bg-monsoon-800 ${weatherData.iconColor}`}>
        {renderWeatherIcon(weatherData.iconType, weatherData.iconColor, 32)}
      </div>
    </div>
  );
};
