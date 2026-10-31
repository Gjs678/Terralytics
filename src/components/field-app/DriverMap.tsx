import React, { useEffect, useRef, useState } from 'react';
import { mappls, mappls_plugin } from 'mappls-web-maps';

const m: any = new (mappls as any)();
const m_plugin: any = new (mappls_plugin as any)();

interface DriverMapProps {
  activeRoute: { lat: number; lng: number }[] | null;
  fastestRoute: { lat: number; lng: number }[] | null;
  dangerZone: { center: { lat: number; lng: number }; radius: number; type?: string } | null;
  // Simulated live vehicle position (driver-movement demo). Optional so this
  // component works unchanged wherever a caller doesn't pass it.
  vehiclePosition?: { lat: number; lng: number } | null;
}

export const DriverMap: React.FC<DriverMapProps> = ({ activeRoute, fastestRoute, dangerZone, vehiclePosition }) => {
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
          }
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
      try { directionPluginRef.current.remove(); } catch (e) {}
      directionPluginRef.current = null;
    }
    
    if (fastestPluginRef.current) {
      try { m.remove({ map: mapObject, layer: fastestPluginRef.current }); } catch (e) {}
      fastestPluginRef.current = null;
    }
    
    try {
      if (mapObject && mapObject.getLayer('fastest-route-layer')) {
        mapObject.removeLayer('fastest-route-layer');
      }
      if (mapObject && mapObject.getSource('fastest-route-source')) {
        mapObject.removeSource('fastest-route-source');
      }
    } catch (e) {}
    let isMounted = true;

    // Helper to draw the Blue active route
    const drawActiveRoute = () => {
      if (activeRoute && activeRoute.length >= 2) {
        const start = `${activeRoute[0].lat},${activeRoute[0].lng}`;
        const end = `${activeRoute[activeRoute.length - 1].lat},${activeRoute[activeRoute.length - 1].lng}`;
        
        let via = '';
        if (activeRoute.length > 2) {
           via = activeRoute.slice(1, -1).map(pt => `${pt.lat},${pt.lng}`).join(';');
        }

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
            // Native Mapbox GL JS layer insertion (places red line BELOW the blue direction plugin layer)
          try {
            const geojsonData = {
              type: 'Feature',
              properties: {},
              geometry: data.routes[0].geometry
            };

            if (mapObject.getSource('fastest-route-source')) {
              mapObject.getSource('fastest-route-source').setData(geojsonData);
            } else {
              mapObject.addSource('fastest-route-source', {
                type: 'geojson',
                data: geojsonData
              });
              
              // We add the layer without beforeId, so it sits at the bottom of the map's drawn vectors.
              // The direction plugin (blue line) will be added shortly after, guaranteeing it renders on top.
              mapObject.addLayer({
                id: 'fastest-route-layer',
                type: 'line',
                source: 'fastest-route-source',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#ef4444', 'line-width': 5, 'line-opacity': 0.9 }
              });
            }
          } catch (e) {
            console.error("Native layer failed, falling back to m.Polyline", e);
            // Fallback just in case mapObject doesn't expose standard mapbox methods
            const coords = data.routes[0].geometry.coordinates;
            const polylinePaths = coords.map((c: any) => ({ lat: c[1], lng: c[0] }));
            
            fastestPluginRef.current = new m.Polyline({
              map: mapObject,
              paths: polylinePaths,
              strokeColor: '#ef4444', 
              strokeOpacity: 0.9,
              strokeWeight: 5
            });
          }
          }
          
          // 2. Draw Active Route (Blue) AFTER Red so it overlaps on top
          setTimeout(() => {
            if (isMounted) drawActiveRoute();
          }, 100);
        })
        .catch(err => {
          console.error("OSRM fetch error:", err);
          if (isMounted) drawActiveRoute(); // Draw blue anyway if fetch fails
        });
    } else {
      drawActiveRoute();
    }

    return () => { isMounted = false; };
  }, [mapObject, activeRoute, fastestRoute]);

  // Update Danger Zone Overlay
  useEffect(() => {
    if (!mapObject) return;

    if (dangerCircleRef.current) {
      try { m.remove({ map: mapObject, layer: dangerCircleRef.current }); } catch (e) {}
      dangerCircleRef.current = null;
    }

    if (dangerZone) {
      dangerCircleRef.current = m.Circle({
        map: mapObject,
        center: dangerZone.center,
        radius: dangerZone.radius, // in meters
        fillColor: '#dc2626', // red-600
        fillOpacity: 0.4,
        strokeColor: '#991b1b', // red-800
        strokeWeight: 2,
      });
    }
  }, [mapObject, dangerZone]);

  // Simulated live vehicle marker
  useEffect(() => {
    if (!mapObject || !vehiclePosition) return;
    try {
      if (vehicleMarkerRef.current) {
        vehicleMarkerRef.current.setPosition
          ? vehicleMarkerRef.current.setPosition(vehiclePosition)
          : (vehicleMarkerRef.current.remove?.(), (vehicleMarkerRef.current = null));
      }
      if (!vehicleMarkerRef.current) {
        vehicleMarkerRef.current = new m.Marker({
          map: mapObject,
          position: vehiclePosition,
          fitbounds: false,
          icon_class: 'vehicle-marker',
        });
      }
    } catch (e) {
      // Non-fatal: marker plugin quirks shouldn't break the map/route demo
    }
  }, [mapObject, vehiclePosition]);

  return (
    <div className="w-full h-full relative z-0">
      <div id="driver-map" ref={mapRef} style={{ width: '100%', height: '100%', background: '#f1f5f9' }}></div>
    </div>
  );
};
