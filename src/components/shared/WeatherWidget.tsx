import React, { useEffect, useState } from 'react';
import { Sun, Cloud, CloudRain, CloudLightning, CloudSnow, CloudFog, Loader2, ChevronDown } from 'lucide-react';

interface WeatherData {
  temperature: number;
  code: number;
}

interface WeatherWidgetProps {
  compact?: boolean;
}

const NER_STATES = [
  { name: 'Assam (Guwahati)', lat: 26.1445, lon: 91.7362 },
  { name: 'Meghalaya (Shillong)', lat: 25.5788, lon: 91.8933 },
  { name: 'Arunachal (Itanagar)', lat: 27.1004, lon: 93.6166 },
  { name: 'Nagaland (Kohima)', lat: 25.6701, lon: 94.1077 },
  { name: 'Manipur (Imphal)', lat: 24.8170, lon: 93.9368 },
  { name: 'Mizoram (Aizawl)', lat: 23.7271, lon: 92.7176 },
  { name: 'Tripura (Agartala)', lat: 23.8315, lon: 91.2868 },
  { name: 'Sikkim (Gangtok)', lat: 27.3389, lon: 88.6065 },
];

export const WeatherWidget: React.FC<WeatherWidgetProps> = ({ compact = false }) => {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setLoading(true);
    const { lat, lon } = NER_STATES[selectedIndex];
    
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`)
      .then(res => {
        if (!res.ok) throw new Error('Network response was not ok');
        return res.json();
      })
      .then(data => {
        setWeather({
          temperature: data.current.temperature_2m,
          code: data.current.weather_code,
        });
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch weather:", err);
        setError(true);
        setLoading(false);
      });
  }, [selectedIndex]);

  // WMO Weather interpretation codes mapping
  const getWeatherDetails = (code: number) => {
    if (code === 0) return { label: 'Clear Sky', Icon: Sun, color: 'text-amber-500' };
    if (code <= 3) return { label: 'Cloudy', Icon: Cloud, color: 'text-monsoon-400' };
    if (code === 45 || code === 48) return { label: 'Fog', Icon: CloudFog, color: 'text-monsoon-300' };
    if (code >= 51 && code <= 67) return { label: 'Rain', Icon: CloudRain, color: 'text-blue-500' };
    if (code >= 71 && code <= 77) return { label: 'Snow', Icon: CloudSnow, color: 'text-blue-300' };
    if (code >= 80 && code <= 82) return { label: 'Showers', Icon: CloudRain, color: 'text-blue-500' };
    if (code >= 95 && code <= 99) return { label: 'Thunderstorm', Icon: CloudLightning, color: 'text-terracotta-500' };
    return { label: 'Unknown', Icon: Cloud, color: 'text-monsoon-400' };
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center rounded-lg border ${compact ? 'bg-white/80 backdrop-blur-md border-monsoon-100 shadow-lg p-2' : 'bg-monsoon-900 border-monsoon-800 p-4 h-full'}`}>
        <Loader2 className="animate-spin text-moss-500" size={24} />
      </div>
    );
  }

  if (error || !weather) {
    return (
      <div className={`flex items-center justify-center rounded-lg border text-xs text-center ${compact ? 'bg-white/80 backdrop-blur-md border-monsoon-100 shadow-lg text-monsoon-600 p-2' : 'bg-monsoon-900 border-monsoon-800 text-monsoon-400 p-4 h-full'}`}>
        Weather unavail.
      </div>
    );
  }

  const { label, Icon, color } = getWeatherDetails(weather.code);

  if (compact) {
    return (
      <div className="relative flex items-center gap-2 bg-white/90 backdrop-blur-md rounded-full px-3 py-1.5 border border-monsoon-200 shadow-sm animate-fade-in hover:shadow-md transition-shadow cursor-pointer group">
        <Icon size={16} className={color} />
        <span className="font-bold text-monsoon-900 text-sm">{Math.round(weather.temperature)}°C</span>
        <ChevronDown size={14} className="text-monsoon-600 group-hover:text-monsoon-900 transition-colors" />
        <select 
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          value={selectedIndex}
          onChange={(e) => setSelectedIndex(Number(e.target.value))}
          title="Select Location"
        >
          {NER_STATES.map((state, idx) => (
            <option key={idx} value={idx} className="text-monsoon-900 bg-white">{state.name}</option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between bg-monsoon-900 rounded-lg border border-monsoon-800 p-4 h-full animate-fade-in relative group">
      <div>
        <div className="flex items-center gap-1 mb-1">
          <select 
            className="text-sm font-semibold text-monsoon-300 bg-transparent border-none outline-none cursor-pointer appearance-none hover:text-moss-300 transition-colors pr-4 relative z-10"
            value={selectedIndex}
            onChange={(e) => setSelectedIndex(Number(e.target.value))}
          >
            {NER_STATES.map((state, idx) => (
              <option key={idx} value={idx} className="text-monsoon-900 bg-white">{state.name}</option>
            ))}
          </select>
          <ChevronDown size={14} className="text-monsoon-400 absolute left-[125px] pointer-events-none" />
        </div>
        <div className="flex items-end gap-2">
          <span className="text-3xl font-semibold text-monsoon-50 tracking-tight">{Math.round(weather.temperature)}°C</span>
          <span className={`text-sm font-medium mb-1 ${color}`}>{label}</span>
        </div>
      </div>
      <div className={`p-3 rounded-full bg-monsoon-800 ${color}`}>
        <Icon size={32} />
      </div>
    </div>
  );
};
