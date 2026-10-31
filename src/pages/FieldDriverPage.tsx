import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ConnectivityBadge } from '../components/field-app/ConnectivityBadge';
import { LanguageSwitcher } from '../components/field-app/LanguageSwitcher';
import { DriverMap } from '../components/field-app/DriverMap';
import { ReportBlockageButton } from '../components/field-app/ReportBlockageButton';
import { RerouteBanner } from '../components/field-app/RerouteBanner';
import { VoiceCommandButton } from '../components/field-app/VoiceCommandButton';
import { RouteExplanationAI } from '../components/field-app/RouteExplanationAI';
import { Navigation, Menu, Package, House, Monitor, AlertTriangle, ShieldCheck, Bell, X, PlayCircle, PauseCircle } from 'lucide-react';
import { WeatherWidget } from '../components/shared/WeatherWidget';
import { mossamApi, type RouteComparisonDto } from '../services/api';
import { cacheActiveRoute, getCachedRoute, isOnline } from '../services/offlineQueue';

// Mock Data for the driver's orders
const MOCK_ORDERS = [
  {
    id: 'ORD-7732',
    vehicleId: 'TRK-9012',
    destination: 'Shillong (Meghalaya)',
    items: 'Medical Supplies',
    eta: '2H 15M',
    status: 'Pending',
    // Route avoiding Nongpoh (dangerZone) by going West via Rani/Mairang
    route: [
      { lat: 26.1158, lng: 91.7026 }, // Guwahati
      { lat: 26.0500, lng: 91.6000 }, // Rani area detour
      { lat: 25.5600, lng: 91.6300 }, // Mairang detour
      { lat: 25.5788, lng: 91.8933 }  // Shillong
    ],
    // The direct NH-6 route that is faster but dangerous
    fastestRoute: [
      { lat: 26.1158, lng: 91.7026 },
      { lat: 25.8000, lng: 91.8500 }, // Forces route through Nongpoh danger zone
      { lat: 25.5788, lng: 91.8933 }
    ],
    dangerZone: { center: { lat: 25.8000, lng: 91.8500 }, radius: 5000, type: 'Flash Flood' }
  },
  {
    id: 'ORD-8991',
    vehicleId: 'TRK-8845',
    destination: 'Tawang (Arunachal)',
    items: 'Rations & Water',
    eta: '5H 40M',
    status: 'Pending',
    // Route avoiding Bhalukpong (dangerZone) by going West via Kalaktang
    route: [
      { lat: 26.1158, lng: 91.7026 }, // Guwahati
      { lat: 27.1000, lng: 92.1100 }, // Kalaktang detour
      { lat: 27.1100, lng: 92.2600 }, // Shergaon detour
      { lat: 27.5861, lng: 91.8631 }  // Tawang
    ],
    fastestRoute: [
      { lat: 26.1158, lng: 91.7026 },
      { lat: 27.0500, lng: 92.6000 }, // Forces route through Bhalukpong danger zone
      { lat: 27.5861, lng: 91.8631 }
    ],
    dangerZone: { center: { lat: 27.0500, lng: 92.6000 }, radius: 10000, type: 'Massive Landslide' }
  },
  {
    id: 'ORD-9021',
    vehicleId: 'TRK-7721',
    destination: 'Majuli (Assam)',
    items: 'Emergency Kits',
    eta: '4H 10M',
    status: 'Pending',
    // Route avoiding Dergaon (dangerZone) by going North of river via Tezpur/North Lakhimpur
    route: [
      { lat: 26.1158, lng: 91.7026 }, // Guwahati
      { lat: 26.6333, lng: 92.8000 }, // Tezpur detour
      { lat: 27.2333, lng: 94.1000 }, // North Lakhimpur detour
      { lat: 26.9500, lng: 94.1667 }  // Majuli
    ],
    fastestRoute: [
      { lat: 26.1158, lng: 91.7026 },
      { lat: 26.702, lng: 93.970 }, // Forces route through Dergaon danger zone
      { lat: 26.9500, lng: 94.1667 }
    ],
    dangerZone: { center: { lat: 26.702, lng: 93.970 }, radius: 6000, type: 'Severe River Bank Erosion' }
  },
  {
    id: 'ORD-4402',
    vehicleId: 'TRK-5534',
    destination: 'Silchar (Assam)',
    items: 'Vaccines (Cold Chain)',
    eta: '7H 20M',
    status: 'Pending',
    // Route avoiding East Jaintia Hills (dangerZone) by going East via Lumding/Haflong
    route: [
      { lat: 26.1158, lng: 91.7026 }, // Guwahati
      { lat: 25.7500, lng: 93.1700 }, // Lumding detour
      { lat: 25.1700, lng: 93.0200 }, // Haflong detour
      { lat: 24.8333, lng: 92.7789 }  // Silchar
    ],
    fastestRoute: [
      { lat: 26.1158, lng: 91.7026 },
      { lat: 25.5000, lng: 92.2000 }, // Forces route through East Jaintia Hills danger zone
      { lat: 24.8333, lng: 92.7789 }
    ],
    dangerZone: { center: { lat: 25.5000, lng: 92.2000 }, radius: 15000, type: 'Cyclone Remnants / Heavy Storm' }
  }
];

export const FieldDriverPage: React.FC = () => {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [comparison, setComparison] = useState<RouteComparisonDto | null>(null);
  const [rerouteAccepted, setRerouteAccepted] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simPosition, setSimPosition] = useState<{ lat: number; lng: number } | null>(null);
  const simIndexRef = useRef(0);

  const selectedOrder = MOCK_ORDERS.find(o => o.id === selectedOrderId);

  // Poll the backend route comparison for the selected order's vehicle to
  // see whether a pending AI reroute exists (e.g. after a control-room
  // "Simulate Incident" trigger), and drive the RerouteBanner from real data.
  useEffect(() => {
    setComparison(null);
    setRerouteAccepted(false);
    setIsSimulating(false);
    simIndexRef.current = 0;
    if (selectedOrder) setSimPosition(selectedOrder.route[0] ? { lat: selectedOrder.route[0].lat, lng: selectedOrder.route[0].lng } : null);
    if (!selectedOrder?.vehicleId) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const cmp = await mossamApi.compareRoutes(selectedOrder.vehicleId);
        if (!cancelled) {
          setComparison(cmp);
          if (cmp.standard_route) cacheActiveRoute(cmp.standard_route);
        }
      } catch (e) {
        // No comparison yet / backend unavailable - fall back to cached route if present
        if (!cancelled) {
          const cached = getCachedRoute();
          if (cached) setComparison((prev) => prev ?? { vehicle_id: selectedOrder.vehicleId, standard_route: cached as any, ai_route: null, explanation: null });
        }
      }
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [selectedOrderId]);

  const hasPendingReroute = !!comparison?.ai_route && !rerouteAccepted;

  const handleAcceptReroute = async () => {
    if (!selectedOrder?.vehicleId) return;
    try {
      await mossamApi.acceptReroute(selectedOrder.vehicleId);
      setRerouteAccepted(true);
    } catch (e) {
      // If accept fails (e.g. backend restarted), still reflect it locally for the demo
      setRerouteAccepted(true);
    }
  };

  // Simple simulated vehicle movement along the active route's coordinates.
  useEffect(() => {
    if (!isSimulating || !selectedOrder?.vehicleId) return;
    const path = (rerouteAccepted && comparison?.ai_route ? comparison.ai_route.coordinates.map(([lat, lng]) => ({ lat, lng })) : null)
      || selectedOrder.route;
    const interval = setInterval(async () => {
      simIndexRef.current = Math.min(simIndexRef.current + 1, path.length - 1);
      const point = path[simIndexRef.current];
      setSimPosition(point);
      if (isOnline()) {
        try {
          await mossamApi.updateVehiclePosition(selectedOrder.vehicleId, point.lat, point.lng);
        } catch (e) {
          // non-fatal for the demo
        }
      }
      if (simIndexRef.current >= path.length - 1) setIsSimulating(false);
    }, 1500);
    return () => clearInterval(interval);
  }, [isSimulating, selectedOrderId, rerouteAccepted]);

  const activeRouteForMap = rerouteAccepted && comparison?.ai_route
    ? comparison.ai_route.coordinates.map(([lat, lng]) => ({ lat, lng }))
    : selectedOrder?.route ?? null;

  return (
    <div className="relative h-full animate-fade-in bg-monsoon-50 overflow-hidden">
      
      {/* Main Map Container - FULL SCREEN */}
      <div className="absolute inset-0 z-0">
        <DriverMap 
          key={selectedOrderId || 'empty'}
          activeRoute={activeRouteForMap}
          fastestRoute={selectedOrder ? selectedOrder.fastestRoute : null}
          dangerZone={selectedOrder ? selectedOrder.dangerZone : null}
          vehiclePosition={simPosition}
        />
      </div>

      {/* Top App Bar - FLOATING */}
      <div className="absolute top-0 left-0 right-0 z-30 px-4 py-3 flex justify-between items-center bg-white/90 backdrop-blur-md border-b border-monsoon-100 shadow-sm transition-all">
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          <button 
            className="p-2 -ml-2 text-monsoon-800 hover:bg-monsoon-100 rounded-full transition-colors"
            onClick={() => setIsSidebarOpen(true)}
            aria-label="Open deliveries menu"
          >
            <Menu size={24} />
          </button>
          <Link
            to="/"
            className="p-2 text-monsoon-800 hover:bg-monsoon-100 rounded-full transition-colors"
            aria-label="Home"
            title="Back to the TERRALYTICS home page"
          >
            <House size={20} />
          </Link>
        </div>
        <div className="flex-1 flex justify-center min-w-0 px-1">
          <WeatherWidget compact={true} />
        </div>
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <Link
            to="/control-room"
            className="hidden md:flex items-center gap-2 rounded-md border border-monsoon-200 bg-white px-3 py-1.5 text-sm font-medium text-monsoon-800 hover:bg-monsoon-50 transition-colors"
            title="Switch to Control Room view"
          >
            <Monitor size={16} />
            Control Room
          </Link>
          <ConnectivityBadge />
          <button 
            className="p-2 text-monsoon-600 hover:text-moss-600 hover:bg-moss-50 rounded-full transition-all relative"
            onClick={() => setShowNotifications(!showNotifications)}
            aria-label="Community alerts"
          >
            <Bell size={20} />
            <span className="absolute top-1.5 right-2 w-2 h-2 bg-terracotta-500 rounded-full animate-pulse"></span>
          </button>
          <LanguageSwitcher />
        </div>
      </div>

      {/* Notifications Panel */}
      {showNotifications && (
        <div className="absolute top-[60px] right-4 w-80 bg-white rounded-lg shadow-2xl border border-monsoon-100 z-50 animate-fade-in overflow-hidden">
          <div className="p-4 border-b border-monsoon-100 flex justify-between items-center bg-monsoon-50/50">
            <h3 className="font-bold text-monsoon-900">Community Alerts</h3>
            <button onClick={() => setShowNotifications(false)} className="text-monsoon-400 hover:text-monsoon-600">
              <X size={18} />
            </button>
          </div>
          <div className="p-2 max-h-64 overflow-y-auto custom-scrollbar">
            <div className="p-3 bg-terracotta-50 border border-terracotta-100 rounded-md mb-2">
              <div className="flex justify-between items-start mb-1">
                <span className="text-xs font-bold text-terracotta-700 bg-terracotta-200/50 px-2 py-0.5 rounded-full">New Alert</span>
                <span className="text-xs text-terracotta-600 font-medium">Just now</span>
              </div>
              <p className="text-sm font-semibold text-terracotta-900 mb-1">Flooded Road Reported</p>
              <p className="text-xs text-terracotta-800 mb-2">NH-27 near Sonapur blocked by heavy flooding. Avoid route.</p>
              <div className="flex items-center gap-1 text-xs text-terracotta-600 font-medium">
                <ShieldCheck size={12} />
                Routing engine is calculating detours
              </div>
            </div>
            
            <div className="p-3 bg-monsoon-50 border border-monsoon-100 rounded-md opacity-70">
              <div className="flex justify-between items-start mb-1">
                <span className="text-xs font-bold text-monsoon-600 bg-monsoon-200/50 px-2 py-0.5 rounded-full">Resolved</span>
                <span className="text-xs text-monsoon-600 font-medium">2h ago</span>
              </div>
              <p className="text-sm font-semibold text-monsoon-900 mb-1">Fallen Tree Cleared</p>
              <p className="text-xs text-monsoon-700">Guwahati-Shillong highway is now clear.</p>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="absolute inset-0 bg-monsoon-900/40 backdrop-blur-sm z-40 md:hidden animate-fade-in"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Floating Orders Panel (Sidebar on Mobile, Floating on Desktop) */}
      <div className={`absolute z-50 top-0 bottom-0 left-0 w-[85%] max-w-[380px] bg-white shadow-2xl flex flex-col transition-transform duration-300 md:z-20 md:top-[80px] md:bottom-6 md:left-6 md:w-[380px] md:rounded-xl md:translate-x-0 border border-monsoon-100/50 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        
        {/* Mobile Header */}
        <div className="px-6 py-5 border-b border-monsoon-100 flex justify-between items-center shrink-0 md:hidden bg-monsoon-50">
           <h2 className="text-xl font-heading font-bold text-monsoon-900">TERRALYTICS Driver</h2>
           <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-monsoon-600 bg-white rounded-full shadow-sm hover:bg-monsoon-100" aria-label="Close menu">
             <X size={18} />
           </button>
        </div>

        <nav aria-label="Switch view" className="px-6 py-3 border-b border-monsoon-100 flex gap-2 shrink-0 md:hidden">
          <Link to="/" className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-monsoon-200 bg-white px-2 py-2 text-sm font-medium text-monsoon-800 hover:bg-monsoon-50">
            <House size={16} /> Home
          </Link>
          <Link to="/control-room" className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-monsoon-200 bg-white px-2 py-2 text-sm font-medium text-monsoon-800 hover:bg-monsoon-50">
            <Monitor size={16} /> Control Room
          </Link>
        </nav>
        
        <div className="px-6 pt-4 md:pt-6 pb-4 border-b border-monsoon-100 flex justify-between items-center shrink-0">
          <h2 className="text-xl font-heading font-bold text-monsoon-900">Deliveries</h2>
          <span className="bg-monsoon-100 text-monsoon-600 text-xs font-bold px-2.5 py-1 rounded-full">{MOCK_ORDERS.length} Pending</span>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {MOCK_ORDERS.map((order) => (
            <button
              key={order.id}
              onClick={() => {
                setSelectedOrderId(order.id);
                if (window.innerWidth < 768) setIsSidebarOpen(false);
              }}
              className={`w-full text-left p-4 rounded-lg border transition-all duration-300 relative overflow-hidden group ${
                selectedOrderId === order.id 
                  ? 'border-moss-500 bg-moss-50 shadow-md ring-1 ring-moss-500/20' 
                  : 'border-monsoon-100 bg-white hover:border-monsoon-300 hover:shadow-sm'
              }`}
            >
              {/* Subtle accent line for active order */}
              {selectedOrderId === order.id && <div className="absolute left-0 top-0 bottom-0 w-1 bg-moss-500"></div>}

              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg ${selectedOrderId === order.id ? 'bg-moss-100 text-moss-600' : 'bg-monsoon-50 text-monsoon-600 group-hover:bg-monsoon-100'}`}>
                    <Package size={16} />
                  </div>
                  <span className="font-bold text-monsoon-900">{order.id}</span>
                </div>
                <span className={`text-xs font-bold px-2 py-1 rounded-md ${selectedOrderId === order.id ? 'bg-moss-200/50 text-moss-700' : 'bg-blue-50 text-blue-600'}`}>{order.eta}</span>
              </div>
              
              <p className="text-[15px] text-monsoon-900 mb-1 font-semibold ml-8">{order.destination}</p>
              <p className="text-xs text-monsoon-600 mb-3 ml-8">{order.items}</p>
              
              {order.dangerZone && (
                <div className="ml-8 flex items-center gap-1.5 text-[11px] font-bold text-terracotta-600 bg-terracotta-50 py-1.5 px-2.5 rounded-lg border border-terracotta-100">
                  <AlertTriangle size={12} />
                  <span>{order.dangerZone.type.toUpperCase()} AHEAD</span>
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Quick Actions (Sticky Bottom) */}
        <div className="p-4 bg-monsoon-50/50 border-t border-monsoon-100 shrink-0 md:rounded-b-xl flex gap-3">
          <div className="flex-1">
            <ReportBlockageButton
              vehicleId={selectedOrder?.vehicleId}
              lat={simPosition?.lat ?? selectedOrder?.route[0]?.lat ?? 26.1158}
              lng={simPosition?.lng ?? selectedOrder?.route[0]?.lng ?? 91.7026}
            />
          </div>
          <VoiceCommandButton />
        </div>
      </div>

      {/* Map Overlay Instructions (Floating on Map) */}
      {selectedOrder ? (
        <div className="absolute top-[80px] md:top-[80px] md:left-[420px] left-4 right-4 md:right-auto md:max-w-sm flex flex-col gap-3 animate-fade-in z-10">
          {hasPendingReroute && (
            <div className="!mx-0 !mt-0">
              <RerouteBanner
                onAccept={handleAcceptReroute}
                reason={comparison?.explanation ?? undefined}
                distanceDeltaKm={
                  comparison?.ai_route ? comparison.ai_route.distance_km - comparison.standard_route.distance_km : undefined
                }
                etaDeltaHours={
                  comparison?.ai_route ? comparison.ai_route.travel_time_hours - comparison.standard_route.travel_time_hours : undefined
                }
              />
            </div>
          )}

          <div className="bg-white/95 backdrop-blur-md rounded-lg p-4 shadow-xl border border-monsoon-100 flex flex-col items-start gap-3">
            <div className="flex items-start gap-3 w-full">
              <div className="bg-moss-500 text-white rounded-full p-2.5 shrink-0 shadow-md">
                <Navigation size={20} className="rotate-45" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1.5">
                   <span className="bg-moss-100 text-moss-700 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border border-moss-200 tracking-wide">
                     {rerouteAccepted ? 'Rerouted' : 'AI Optimized'}
                   </span>
                   <p className="text-sm font-bold text-monsoon-900">Routing to {selectedOrder.destination}</p>
                </div>
                {selectedOrder.dangerZone ? (
                  <div className="flex flex-col gap-1">
                    <p className="text-xs text-moss-600 font-bold flex items-center gap-1">
                      <ShieldCheck size={14} /> Safe route active
                    </p>
                    <p className="text-xs text-terracotta-600 font-medium flex items-center gap-1">
                      <X size={12} /> Faster route avoided: {selectedOrder.dangerZone.type}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-moss-600 font-medium mt-1">Clear Route Ahead</p>
                )}
              </div>
            </div>

            {selectedOrder.vehicleId && (
              <button
                onClick={() => setIsSimulating((s) => !s)}
                className="w-full flex items-center justify-center gap-2 text-xs font-semibold py-2 rounded-lg border border-monsoon-200 text-monsoon-700 hover:bg-monsoon-50 transition-colors"
              >
                {isSimulating ? <PauseCircle size={14} /> : <PlayCircle size={14} />}
                {isSimulating ? 'Pause Simulated Drive' : 'Simulate Vehicle Movement'}
              </button>
            )}

            <div className="w-full mt-1 border-t border-monsoon-100 pt-2">
              <RouteExplanationAI order={selectedOrder} />
            </div>
          </div>
        </div>
      ) : (
        <div className="absolute top-[80px] md:top-[80px] md:left-[420px] left-4 right-4 md:right-auto md:w-64 bg-monsoon-900/80 backdrop-blur-md px-4 py-3 rounded-md font-medium text-white shadow-lg flex items-center justify-center animate-fade-in z-10">
          Select an order to view route
        </div>
      )}
    </div>
  );
};
