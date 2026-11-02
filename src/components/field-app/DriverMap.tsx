import React, { useEffect, useRef, useState } from 'react';
import { mappls, mappls_plugin } from 'mappls-web-maps';

const m: any = new (mappls as any)();
const m_plugin: any = new (mappls_plugin as any)();

interface DriverMapProps {
  activeRoute: { lat: number; lng: number }[] | null;
  fastestRoute: { lat: number; lng: number }[] | null;
  dangerZone: { center: { lat: number; lng: number }; radius: number; type?: string } | null;
  vehiclePosition?: { lat: number; lng: number } | null;
  simulationStatus?: 'idle' | 'running' | 'paused' | 'completed';
}

export const DriverMap: React.FC<DriverMapProps> = ({
  activeRoute,
  fastestRoute,
  dangerZone,
  vehiclePosition,
  simulationStatus,
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapObject, setMapObject] = useState<any>(null);
  const directionPluginRef = useRef<any>(null);
  const fastestPluginRef = useRef<any>(null);
  const dangerCircleRef = useRef<any>(null);
  const vehicleMarkerRef = useRef<any>(null);

  useEffect(() => {
    let isMounted = true;
    m.initialize(import.meta.env.VITE_MAPMYINDIA_API_KEY, { map: true, plugins: ['direction'] }, () => {
      if (isMounted && mapRef.current) {
        const map = m.Map({
          id: 'driver-map',
          properties: {
            center: [26.1158, 91.7026], // Guwahati Default
            zoom: 12,
            zoomControl: false,
          },
        });
        setMapObject(map);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  // Update Routing Engine
  useEffect(() => {
    if (!mapObject) return;

    if (directionPluginRef.current) {
      try {
        directionPluginRef.current.remove();
      } catch {
        // safe ignore
      }
      directionPluginRef.current = null;
    }

    if (fastestPluginRef.current) {
      try {
        m.remove({ map: mapObject, layer: fastestPluginRef.current });
      } catch {
        // safe ignore
      }
      fastestPluginRef.current = null;
    }

    try {
      if (mapObject && mapObject.getLayer && mapObject.getLayer('fastest-route-layer')) {
        mapObject.removeLayer('fastest-route-layer');
      }
      if (mapObject && mapObject.getSource && mapObject.getSource('fastest-route-source')) {
        mapObject.removeSource('fastest-route-source');
      }
    } catch {
      // safe ignore
    }
    let isMounted = true;

    // Helper to draw the Blue active route
    const drawActiveRoute = () => {
      if (activeRoute && activeRoute.length >= 2) {
        const start = `${activeRoute[0].lat},${activeRoute[0].lng}`;
        const end = `${activeRoute[activeRoute.length - 1].lat},${activeRoute[activeRoute.length - 1].lng}`;

        let via = '';
        if (activeRoute.length > 2) {
          via = activeRoute
            .slice(1, -1)
            .map(pt => `${pt.lat},${pt.lng}`)
            .join(';');
        }

        try {
          directionPluginRef.current = m_plugin.direction({
            map: mapObject,
            start: start,
            end: end,
            via: via ? via : undefined,
            profile: 'driving',
            strokeColor: '#3b82f6',
            strokeWidth: 6,
            fitbounds: true,
            search: false,
          });
        } catch {
          // fallback if plugin fails
        }
      }
    };

    // 1. Fetch and draw Fastest Route (Red) first
    if (fastestRoute && fastestRoute.length >= 2) {
      const coordinates = fastestRoute.map(pt => `${pt.lng},${pt.lat}`).join(';');
      const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson`;

      fetch(url)
        .then(res => res.json())
        .then(data => {
          if (!isMounted) return;
          if (data && data.code === 'Ok' && data.routes && data.routes.length > 0) {
            try {
              const geojsonData = {
                type: 'Feature',
                properties: {},
                geometry: data.routes[0].geometry,
              };

              if (mapObject.getSource('fastest-route-source')) {
                mapObject.getSource('fastest-route-source').setData(geojsonData);
              } else {
                mapObject.addSource('fastest-route-source', {
                  type: 'geojson',
                  data: geojsonData,
                });

                mapObject.addLayer({
                  id: 'fastest-route-layer',
                  type: 'line',
                  source: 'fastest-route-source',
                  layout: { 'line-join': 'round', 'line-cap': 'round' },
                  paint: { 'line-color': '#ef4444', 'line-width': 5, 'line-opacity': 0.9 },
                });
              }
            } catch {
              const coords = data.routes[0].geometry.coordinates;
              const polylinePaths = coords.map((c: any) => ({ lat: c[1], lng: c[0] }));

              fastestPluginRef.current = new m.Polyline({
                map: mapObject,
                paths: polylinePaths,
                strokeColor: '#ef4444',
                strokeOpacity: 0.9,
                strokeWeight: 5,
              });
            }
          }

          // 2. Draw Active Route (Blue) AFTER Red so it renders on top
          setTimeout(() => {
            if (isMounted) drawActiveRoute();
          }, 100);
        })
        .catch(() => {
          if (isMounted) drawActiveRoute();
        });
    } else {
      drawActiveRoute();
    }

    return () => {
      isMounted = false;
    };
  }, [mapObject, activeRoute, fastestRoute]);

  // Update Danger Zone Overlay
  useEffect(() => {
    if (!mapObject) return;

    if (dangerCircleRef.current) {
      try {
        m.remove({ map: mapObject, layer: dangerCircleRef.current });
      } catch {
        // safe ignore
      }
      dangerCircleRef.current = null;
    }

    if (dangerZone) {
      try {
        dangerCircleRef.current = m.Circle({
          map: mapObject,
          center: dangerZone.center,
          radius: dangerZone.radius, // in meters
          fillColor: '#dc2626', // red-600
          fillOpacity: 0.35,
          strokeColor: '#991b1b', // red-800
          strokeWeight: 2,
        });
      } catch {
        // safe ignore
      }
    }
  }, [mapObject, dangerZone]);

  // Live Vehicle Movement Marker (Simulation & Tracking)
  useEffect(() => {
    if (!mapObject || !vehiclePosition) {
      if (vehicleMarkerRef.current) {
        try {
          if (vehicleMarkerRef.current.remove) {
            vehicleMarkerRef.current.remove();
          } else {
            m.remove({ map: mapObject, layer: vehicleMarkerRef.current });
          }
        } catch {
          // safe ignore
        }
        vehicleMarkerRef.current = null;
      }
      return;
    }

    const isRunning = simulationStatus === 'running';
    const isCompleted = simulationStatus === 'completed';
    const markerColor = isCompleted ? '#2563eb' : isRunning ? '#10b981' : '#f59e0b';
    const markerPulse = isRunning ? 'animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;' : '';

    const markerHtml = `
      <div style="position: relative; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
        <div style="position: absolute; inset: -4px; border-radius: 50%; background: ${markerColor}; opacity: 0.3; ${markerPulse}"></div>
        <div style="width: 26px; height: 26px; border-radius: 50%; background: ${markerColor}; border: 2.5px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; color: white;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/>
            <path d="M15 18H9"/>
            <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/>
            <circle cx="17" cy="18.5" r="2.5"/>
            <circle cx="7" cy="18.5" r="2.5"/>
          </svg>
        </div>
      </div>
    `;

    try {
      if (vehicleMarkerRef.current) {
        if (typeof vehicleMarkerRef.current.setPosition === 'function') {
          vehicleMarkerRef.current.setPosition(vehiclePosition);
          return;
        }
        // If setPosition is not supported or recreation needed for HTML update
        try {
          if (vehicleMarkerRef.current.remove) {
            vehicleMarkerRef.current.remove();
          } else {
            m.remove({ map: mapObject, layer: vehicleMarkerRef.current });
          }
        } catch {
          // ignore
        }
        vehicleMarkerRef.current = null;
      }

      vehicleMarkerRef.current = m.Marker({
        map: mapObject,
        position: vehiclePosition,
        html: markerHtml,
        width: 28,
        height: 28,
      });
    } catch {
      // Non-fatal fallback
    }
  }, [mapObject, vehiclePosition, simulationStatus]);

  // Clean up all map layers when unmounting
  useEffect(() => {
    return () => {
      if (directionPluginRef.current) {
        try {
          directionPluginRef.current.remove();
        } catch {
          // ignore
        }
      }
      if (fastestPluginRef.current) {
        try {
          m.remove({ map: mapObject, layer: fastestPluginRef.current });
        } catch {
          // ignore
        }
      }
      if (dangerCircleRef.current) {
        try {
          m.remove({ map: mapObject, layer: dangerCircleRef.current });
        } catch {
          // ignore
        }
      }
      if (vehicleMarkerRef.current) {
        try {
          if (vehicleMarkerRef.current.remove) {
            vehicleMarkerRef.current.remove();
          } else {
            m.remove({ map: mapObject, layer: vehicleMarkerRef.current });
          }
        } catch {
          // ignore
        }
      }
    };
  }, [mapObject]);

  return (
    <div className="w-full h-full relative z-0">
      <div id="driver-map" ref={mapRef} style={{ width: '100%', height: '100%', background: '#f1f5f9' }}></div>
    </div>
  );
};
