import React from 'react';
import { CloudRain, Map as MapIcon, Satellite, ServerCog, Wifi } from 'lucide-react';

export const DataSourcesSettingsPage: React.FC = () => {
  const sources = [
    { name: 'IMD Weather API', description: 'Real-time rainfall and cloud cover data.', icon: <CloudRain size={24} />, status: 'Connected', type: 'Meteorological' },
    { name: 'ISRO Bhuvan / NESAC', description: 'High-res terrain, DEM, and slope data.', icon: <Satellite size={24} />, status: 'Connected', type: 'Geospatial' },
    { name: 'PM GatiShakti', description: 'National infrastructure master plan layers.', icon: <ServerCog size={24} />, status: 'Connected', type: 'Infrastructure' },
    { name: 'OpenStreetMap', description: 'Base road network and topology.', icon: <MapIcon size={24} />, status: 'Connected', type: 'Routing' },
    { name: 'GraphHopper Engine', description: 'Dynamic route optimization and weighting.', icon: <Wifi size={24} />, status: 'Connected', type: 'Compute' },
  ];

  return (
    <div className="max-w-4xl mx-auto p-8 animate-fade-in text-monsoon-100">
      <div className="mb-8">
        <h2 className="font-heading text-3xl font-bold mb-2">Integrated Data Sources</h2>
        <p className="text-monsoon-400">Manage connections to external geospatial, weather, and infrastructural data streams driving the TERRALYTICS AI pipeline.</p>
      </div>

      <div className="space-y-4">
        {sources.map((source, i) => (
          <div key={i} className="flex items-center justify-between bg-monsoon-900 border border-monsoon-800 p-6 rounded-lg">
            <div className="flex items-center gap-6">
              <div className="text-moss-400 bg-moss-400/10 p-4 rounded-md">
                {source.icon}
              </div>
              <div>
                <h3 className="font-heading text-xl font-semibold mb-1">{source.name}</h3>
                <p className="text-monsoon-400 text-sm mb-2">{source.description}</p>
                <span className="text-xs font-medium uppercase tracking-wider text-monsoon-500 bg-monsoon-900 px-2 py-1 rounded">
                  {source.type}
                </span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2 text-moss-400 bg-moss-900/30 px-3 py-1.5 rounded-full border border-moss-800">
                <div className="w-2 h-2 rounded-full bg-moss-400 animate-pulse"></div>
                <span className="text-sm font-medium">{source.status}</span>
              </div>
              <span className="text-xs text-monsoon-500">Latency: 42ms</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
