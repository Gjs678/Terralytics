import React, { useState, useEffect, useRef } from 'react';
import { mappls } from 'mappls-web-maps';
import { MOCK_FLEET } from '../../data/mockFleet';
import { mossamApi } from '../../services/api';

const m: any = new (mappls as any)();

const statusColors: Record<string, string> = {
  'in-transit': '#5fae84', // moss-400
  'rerouted': '#d95c41', // terracotta-500
  'delayed': '#f59e0b', // amber-500
  'offline': '#7a93a9', // monsoon-400
};

interface NERMapProps {
  showLandslideRisk: boolean;
  showFloodRisk: boolean;
  showWeather: boolean;
}

export const NERMap: React.FC<NERMapProps> = ({ showLandslideRisk, showFloodRisk }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapObject, setMapObject] = useState<any>(null);
  const [landslideData, setLandslideData] = useState<any>(null);
  const [floodData, setFloodData] = useState<any>(null);

  const markersRef = useRef<any[]>([]);
  const landslideLayerRef = useRef<any>(null);
  const floodLayerRef = useRef<any>(null);

  useEffect(() => {
    // Load mock GeoJSON data
    fetch('/mock-geo/risk-zones-landslide.geojson')
      .then((res) => res.json())
      .then(setLandslideData)
      .catch(console.error);

    fetch('/mock-geo/risk-zones-flood.geojson')
      .then((res) => res.json())
      .then(setFloodData)
      .catch(console.error);
  }, []);

  useEffect(() => {
    let isMounted = true;
    m.initialize(import.meta.env.VITE_MAPMYINDIA_API_KEY, { map: true }, () => {
      if (isMounted && mapRef.current) {
        const map = m.Map({
          id: 'mappls-map',
          properties: {
            center: [26.1158, 91.7026], // Guwahati
            zoom: 7,
            zoomControl: false,
          }
        });
        setMapObject(map);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  // Live Incidents and Fleet State
  const [incidents, setIncidents] = useState<any[]>([]);
  const [fleet, setFleet] = useState<any[]>(MOCK_FLEET);
  const [isLiveConnected, setIsLiveConnected] = useState<boolean>(false);
  const incidentsRef = useRef<any[]>([]);

  // Periodic poll for live backend incidents and fleet positions
  useEffect(() => {
    let cancelled = false;
    const fetchLive = async () => {
      try {
        const [liveIncidents, liveFleet] = await Promise.all([
          mossamApi.getIncidents('active'),
          mossamApi.getFleet(),
        ]);
        if (cancelled) return;
        setIncidents(liveIncidents);
        if (liveFleet && liveFleet.length > 0) {
          setFleet(liveFleet.map((v) => ({
            id: v.id,
            driverName: v.driver_name,
            status: v.status,
            currentLocation: [v.lat, v.lng],
            destination: v.destination,
            eta: v.eta,
          })));
        }
        setIsLiveConnected(true);
      } catch (e) {
        if (!cancelled && !isLiveConnected) {
          // Fall back to baseline mock incidents for offline demonstration
          setIncidents([
            { id: 'INC-001', type: 'Active Landslide', lat: 26.25, lng: 91.82, status: 'Road Blocked', description: 'Simulated baseline hazard' },
            { id: 'INC-002', type: 'Severe Flooding', lat: 26.05, lng: 91.55, status: 'Impassable', description: 'Simulated baseline hazard' }
          ]);
        }
      }
    };

    fetchLive();
    const interval = setInterval(fetchLive, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isLiveConnected]);

  // Render Incident Markers (Reflects live backend DB & simulated incidents)
  useEffect(() => {
    if (!mapObject) return;

    // Clear existing incident markers
    incidentsRef.current.forEach(marker => marker.remove());
    incidentsRef.current = [];

    incidents.forEach(incident => {
      const itype = incident.type ? incident.type.replace('_', ' ').toUpperCase() : 'HAZARD';
      const marker = m.Marker({
        map: mapObject,
        position: { lat: incident.lat, lng: incident.lng },
        html: `
          <div style="position: relative; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">
            <div style="position: absolute; width: 100%; height: 100%; background-color: rgba(220, 38, 38, 0.5); border-radius: 50%; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
            <div style="position: relative; width: 14px; height: 14px; background-color: #dc2626; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 8px rgba(220, 38, 38, 0.8);"></div>
          </div>
        `,
        width: 24,
        height: 24,
        popupHtml: `
          <div style="padding: 6px; min-width: 140px; font-family: sans-serif;">
            <div style="display: flex; align-items: center; gap: 4px; color: #dc2626; font-weight: bold; margin-bottom: 4px;">
              ⚠️ ${itype}
            </div>
            <div style="font-size: 11px; color: #475569;">ID: ${incident.id}</div>
            <div style="font-size: 11px; color: #b91c1c; font-weight: bold; margin-top: 4px;">
              Status: ${incident.status || 'Active'} (${incident.severity || 'severe'})
            </div>
            ${incident.description ? `<div style="font-size: 10px; color: #64748b; margin-top: 4px;">${incident.description}</div>` : ''}
          </div>
        `
      });
      incidentsRef.current.push(marker);
    });
  }, [mapObject, incidents]);

  // Render Fleet Markers (Reflects live backend fleet positions)
  useEffect(() => {
    if (!mapObject) return;

    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    fleet.forEach(vehicle => {
      const loc = vehicle.currentLocation || [26.1158, 91.7026];
      const marker = m.Marker({
        map: mapObject,
        position: { lat: loc[0], lng: loc[1] },
        html: `<div style="background-color: ${statusColors[vehicle.status] || '#5fae84'}; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5); cursor: pointer;"></div>`,
        width: 16,
        height: 16,
        popupHtml: `
          <div style="padding: 4px; min-width: 120px;">
            <h4 style="font-weight: 600; color: #1b232c; font-family: sans-serif;">${vehicle.id}</h4>
            <p style="font-size: 12px; color: #475569; margin-bottom: 4px; font-family: sans-serif;">${vehicle.driverName}</p>
            <div style="font-size: 10px; display: flex; flex-direction: column; gap: 4px; font-family: sans-serif;">
              <span style="text-transform: capitalize;">Status: <strong>${vehicle.status}</strong></span>
              <span>Dest: ${vehicle.destination}</span>
              <span>ETA: ${vehicle.eta}</span>
            </div>
          </div>
        `
      });
      markersRef.current.push(marker);
    });
  }, [mapObject, fleet]);

  // Handle Landslide GeoJSON
  useEffect(() => {
    if (!mapObject || !landslideData) return;

    if (showLandslideRisk) {
      if (!landslideLayerRef.current) {
        landslideLayerRef.current = m.addGeoJson({
          map: mapObject,
          data: landslideData,
          fitbounds: false,
          fillColor: '#d95c41',
          fillOpacity: 0.3,
          strokeColor: '#d95c41',
          strokeWidth: 1,
          cType: 1 // Default GeoJSON format [lng, lat]
        });
      }
    } else {
      if (landslideLayerRef.current) {
        try {
          m.remove({ map: mapObject, layer: landslideLayerRef.current });
        } catch (e) {
          console.error("Failed to remove landslide geojson", e);
        }
        landslideLayerRef.current = null;
      }
    }
  }, [mapObject, showLandslideRisk, landslideData]);

  // Handle Flood GeoJSON
  useEffect(() => {
    if (!mapObject || !floodData) return;

    if (showFloodRisk) {
      if (!floodLayerRef.current) {
        floodLayerRef.current = m.addGeoJson({
          map: mapObject,
          data: floodData,
          fitbounds: false,
          fillColor: '#3b82f6',
          fillOpacity: 0.3,
          strokeColor: '#3b82f6',
          strokeWidth: 1,
          cType: 1
        });
      }
    } else {
      if (floodLayerRef.current) {
        try {
          m.remove({ map: mapObject, layer: floodLayerRef.current });
        } catch (e) {
          console.error("Failed to remove flood geojson", e);
        }
        floodLayerRef.current = null;
      }
    }
  }, [mapObject, showFloodRisk, floodData]);

  return (
    <div className="w-full h-full relative z-0 rounded-lg overflow-hidden border border-monsoon-800 shadow-xl">
      <div id="mappls-map" ref={mapRef} style={{ width: '100%', height: '100%', background: '#1b232c' }}></div>
    </div>
  );
};
