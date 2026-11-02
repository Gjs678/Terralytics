import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ConnectivityBadge } from '../components/field-app/ConnectivityBadge';
import { LanguageSwitcher } from '../components/field-app/LanguageSwitcher';
import { DriverMap } from '../components/field-app/DriverMap';
import { ReportBlockageButton } from '../components/field-app/ReportBlockageButton';
import { RerouteBanner } from '../components/field-app/RerouteBanner';
import { VoiceCommandButton } from '../components/field-app/VoiceCommandButton';
import { RouteExplanationAI } from '../components/field-app/RouteExplanationAI';
import {
  Navigation,
  Menu,
  Package,
  House,
  Monitor,
  AlertTriangle,
  ShieldCheck,
  Bell,
  X,
  PlayCircle,
  PauseCircle,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { WeatherWidget } from '../components/shared/WeatherWidget';
import { mossamApi, type RouteComparisonDto } from '../services/api';
import { cacheActiveRoute, getCachedRoute, isOnline } from '../services/offlineQueue';
import {
  deliveryService,
  type DeliveryOrder,
  type DeliveryStateGroup,
} from '../services/deliveryService';
import { routingService } from '../services/routingService';
import {
  simulationService,
  type SimulationState,
} from '../services/simulationService';

export const FieldDriverPage: React.FC = () => {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isRoutePanelOpen, setIsRoutePanelOpen] = useState(true);
  const [comparison, setComparison] = useState<RouteComparisonDto | null>(null);
  const [rerouteAccepted, setRerouteAccepted] = useState(false);

  // Simulation state from dedicated SimulationService
  const [simState, setSimState] = useState<SimulationState>(() => simulationService.getState());
  const lastBackendUpdateRef = useRef<number>(0);

  // Deliveries grouped alphabetically by destination state
  const stateGroups: DeliveryStateGroup[] = useMemo(() => {
    return deliveryService.groupDeliveriesByState();
  }, []);

  const totalDeliveriesCount = useMemo(() => {
    return stateGroups.reduce((acc, g) => acc + g.deliveries.length, 0);
  }, [stateGroups]);

  const selectedOrder: DeliveryOrder | undefined = useMemo(() => {
    if (!selectedOrderId) return undefined;
    return deliveryService.getDeliveryById(selectedOrderId);
  }, [selectedOrderId]);

  // Subscribe to SimulationService state changes
  useEffect(() => {
    const unsubscribe = simulationService.subscribe(newState => {
      setSimState(newState);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // Set up route geometry and reset simulation whenever the selected order or accepted reroute changes
  useEffect(() => {
    if (!selectedOrder) {
      simulationService.reset();
      simulationService.setGeometry([]);
      return;
    }

    let isMounted = true;
    const waypoints =
      rerouteAccepted && comparison?.ai_route
        ? comparison.ai_route.coordinates.map(([lat, lng]) => ({ lat, lng }))
        : selectedOrder.route;

    // Fetch detailed road polyline from OSRM (or smooth interpolation fallback)
    routingService
      .fetchDetailedGeometry(waypoints)
      .then(detailedGeometry => {
        if (isMounted) {
          simulationService.setGeometry(detailedGeometry);
        }
      })
      .catch(() => {
        if (isMounted) {
          simulationService.setGeometry(waypoints);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedOrderId, rerouteAccepted, comparison?.ai_route, selectedOrder]);

  // Periodic vehicle position sync to backend when simulating
  useEffect(() => {
    if (simState.status !== 'running' || !selectedOrder?.vehicleId || !simState.currentPosition) {
      return;
    }

    const now = Date.now();
    // Throttle backend updates to once every 2.5 seconds
    if (now - lastBackendUpdateRef.current > 2500 && isOnline()) {
      lastBackendUpdateRef.current = now;
      mossamApi
        .updateVehiclePosition(
          selectedOrder.vehicleId,
          simState.currentPosition.lat,
          simState.currentPosition.lng
        )
        .catch(() => {
          // non-fatal for demo
        });
    }
  }, [simState.currentPosition, simState.status, selectedOrder?.vehicleId]);

  // Poll backend route comparison for the selected order's vehicle
  useEffect(() => {
    setComparison(null);
    setRerouteAccepted(false);
    if (!selectedOrder?.vehicleId) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const cmp = await mossamApi.compareRoutes(selectedOrder.vehicleId);
        if (!cancelled) {
          setComparison(cmp);
          if (cmp.standard_route) cacheActiveRoute(cmp.standard_route);
        }
      } catch {
        if (!cancelled) {
          const cached = getCachedRoute();
          if (cached) {
            setComparison(prev => prev ?? {
              vehicle_id: selectedOrder.vehicleId,
              standard_route: cached as any,
              ai_route: null,
              explanation: null,
            });
          }
        }
      }
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [selectedOrderId, selectedOrder]);

  const hasPendingReroute = !!comparison?.ai_route && !rerouteAccepted;

  const handleAcceptReroute = async () => {
    if (!selectedOrder?.vehicleId) return;
    try {
      await mossamApi.acceptReroute(selectedOrder.vehicleId);
      setRerouteAccepted(true);
    } catch {
      setRerouteAccepted(true);
    }
  };

  const activeRouteForMap =
    rerouteAccepted && comparison?.ai_route
      ? comparison.ai_route.coordinates.map(([lat, lng]) => ({ lat, lng }))
      : selectedOrder?.route ?? null;

  return (
    <div className="relative h-full animate-fade-in bg-monsoon-50 overflow-hidden">
      {/* Main Map Container - FULL SCREEN */}
      <div className="absolute inset-0 z-0">
        <DriverMap
          key={selectedOrderId || 'empty'}
          activeRoute={activeRouteForMap}
          fastestRoute={selectedOrder ? selectedOrder.fastestRoute || null : null}
          dangerZone={selectedOrder ? selectedOrder.dangerZone || null : null}
          vehiclePosition={simState.currentPosition}
          simulationStatus={simState.status}
        />
      </div>

      {/* Top App Bar - FLOATING */}
      <div className="absolute top-0 left-0 right-0 z-30 px-4 py-3 flex justify-between items-center bg-white/90 backdrop-blur-md border-b border-monsoon-100 shadow-sm transition-all">
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          <button
            className="p-2 -ml-2 text-monsoon-800 hover:bg-monsoon-100 rounded-full transition-colors cursor-pointer"
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

        {/* Dynamic Weather Widget connected to currently selected delivery */}
        <div className="flex-1 flex justify-center min-w-0 px-1">
          <WeatherWidget
            compact={true}
            selectedState={selectedOrder?.state}
            selectedCity={selectedOrder?.city}
            selectedCoordinates={selectedOrder?.destinationCoords}
          />
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
            className="p-2 text-monsoon-600 hover:text-moss-600 hover:bg-moss-50 rounded-full transition-all relative cursor-pointer"
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
            <button
              onClick={() => setShowNotifications(false)}
              className="text-monsoon-400 hover:text-monsoon-600 cursor-pointer"
              aria-label="Close notifications"
            >
              <X size={18} />
            </button>
          </div>
          <div className="p-2 max-h-64 overflow-y-auto custom-scrollbar">
            <div className="p-3 bg-terracotta-50 border border-terracotta-100 rounded-md mb-2">
              <div className="flex justify-between items-start mb-1">
                <span className="text-xs font-bold text-terracotta-700 bg-terracotta-200/50 px-2 py-0.5 rounded-full">
                  New Alert
                </span>
                <span className="text-xs text-terracotta-600 font-medium">Just now</span>
              </div>
              <p className="text-sm font-semibold text-terracotta-900 mb-1">Flooded Road Reported</p>
              <p className="text-xs text-terracotta-800 mb-2">
                NH-27 near Sonapur blocked by heavy flooding. Avoid route.
              </p>
              <div className="flex items-center gap-1 text-xs text-terracotta-600 font-medium">
                <ShieldCheck size={12} />
                Routing engine is calculating detours
              </div>
            </div>

            <div className="p-3 bg-monsoon-50 border border-monsoon-100 rounded-md opacity-70">
              <div className="flex justify-between items-start mb-1">
                <span className="text-xs font-bold text-monsoon-600 bg-monsoon-200/50 px-2 py-0.5 rounded-full">
                  Resolved
                </span>
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

      {/* Deliveries Sidebar (Desktop floating / Mobile sliding drawer) */}
      <div
        className={`absolute z-50 top-0 bottom-0 left-0 w-[85%] max-w-[380px] bg-white shadow-2xl flex flex-col transition-transform duration-300 md:z-20 md:top-[80px] md:bottom-6 md:left-6 md:w-[380px] md:rounded-xl md:translate-x-0 border border-monsoon-100/50 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Mobile Header */}
        <div className="px-6 py-5 border-b border-monsoon-100 flex justify-between items-center shrink-0 md:hidden bg-monsoon-50">
          <h2 className="text-xl font-heading font-bold text-monsoon-900">TERRALYTICS Driver</h2>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="p-2 text-monsoon-600 bg-white rounded-full shadow-sm hover:bg-monsoon-100 cursor-pointer"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav
          aria-label="Switch view"
          className="px-6 py-3 border-b border-monsoon-100 flex gap-2 shrink-0 md:hidden"
        >
          <Link
            to="/"
            className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-monsoon-200 bg-white px-2 py-2 text-sm font-medium text-monsoon-800 hover:bg-monsoon-50"
          >
            <House size={16} /> Home
          </Link>
          <Link
            to="/control-room"
            className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-monsoon-200 bg-white px-2 py-2 text-sm font-medium text-monsoon-800 hover:bg-monsoon-50"
          >
            <Monitor size={16} /> Control Room
          </Link>
        </nav>

        {/* Deliveries Header */}
        <div className="px-6 pt-4 md:pt-6 pb-4 border-b border-monsoon-100 flex justify-between items-center shrink-0">
          <h2 className="text-xl font-heading font-bold text-monsoon-900">Deliveries</h2>
          <span className="bg-monsoon-100 text-monsoon-600 text-xs font-bold px-2.5 py-1 rounded-full">
            {totalDeliveriesCount} Pending
          </span>
        </div>

        {/* Grouped deliveries list by state */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {stateGroups.map(group => (
            <div key={group.state} className="space-y-2">
              {/* State Group Heading */}
              <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm px-2 py-1 flex items-center justify-between border-b border-monsoon-100 text-[11px] font-bold text-monsoon-700 uppercase tracking-wider">
                <span>{group.state}</span>
                <span className="text-[10px] bg-monsoon-100 text-monsoon-600 px-1.5 py-0.5 rounded-full font-semibold">
                  {group.deliveries.length}
                </span>
              </div>

              {/* Deliveries within group */}
              <div className="space-y-2.5">
                {group.deliveries.map(order => (
                  <button
                    key={order.id}
                    onClick={() => {
                      setSelectedOrderId(order.id);
                      setIsRoutePanelOpen(true);
                      if (window.innerWidth < 768) setIsSidebarOpen(false);
                    }}
                    className={`w-full text-left p-4 rounded-lg border transition-all duration-300 relative overflow-hidden group cursor-pointer ${
                      selectedOrderId === order.id
                        ? 'border-moss-500 bg-moss-50 shadow-md ring-1 ring-moss-500/20'
                        : 'border-monsoon-100 bg-white hover:border-monsoon-300 hover:shadow-sm'
                    }`}
                  >
                    {/* Subtle accent line for active order */}
                    {selectedOrderId === order.id && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-moss-500"></div>
                    )}

                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={`p-1.5 rounded-lg ${
                            selectedOrderId === order.id
                              ? 'bg-moss-100 text-moss-600'
                              : 'bg-monsoon-50 text-monsoon-600 group-hover:bg-monsoon-100'
                          }`}
                        >
                          <Package size={16} />
                        </div>
                        <span className="font-bold text-monsoon-900">{order.id}</span>
                      </div>
                      <span
                        className={`text-xs font-bold px-2 py-1 rounded-md ${
                          selectedOrderId === order.id
                            ? 'bg-moss-200/50 text-moss-700'
                            : 'bg-blue-50 text-blue-600'
                        }`}
                      >
                        {order.eta}
                      </span>
                    </div>

                    <p className="text-[15px] text-monsoon-900 mb-1 font-semibold ml-8">
                      {order.destination}
                    </p>
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
            </div>
          ))}
        </div>

        {/* Quick Actions (Sticky Bottom) */}
        <div className="p-4 bg-monsoon-50/50 border-t border-monsoon-100 shrink-0 md:rounded-b-xl flex gap-3">
          <div className="flex-1">
            <ReportBlockageButton
              vehicleId={selectedOrder?.vehicleId}
              lat={simState.currentPosition?.lat ?? selectedOrder?.route[0]?.lat ?? 26.1158}
              lng={simState.currentPosition?.lng ?? selectedOrder?.route[0]?.lng ?? 91.7026}
            />
          </div>
          <VoiceCommandButton />
        </div>
      </div>

      {/* Floating Route & AI Panel (with Close & Reopen capabilities) */}
      {selectedOrder ? (
        <>
          {isRoutePanelOpen ? (
            <div className="absolute top-[80px] md:top-[80px] md:left-[420px] left-4 right-4 md:right-auto md:max-w-sm flex flex-col gap-3 animate-fade-in z-10">
              {hasPendingReroute && (
                <div className="!mx-0 !mt-0">
                  <RerouteBanner
                    onAccept={handleAcceptReroute}
                    reason={comparison?.explanation ?? undefined}
                    distanceDeltaKm={
                      comparison?.ai_route
                        ? comparison.ai_route.distance_km - comparison.standard_route.distance_km
                        : undefined
                    }
                    etaDeltaHours={
                      comparison?.ai_route
                        ? comparison.ai_route.travel_time_hours - comparison.standard_route.travel_time_hours
                        : undefined
                    }
                  />
                </div>
              )}

              <div className="bg-white/95 backdrop-blur-md rounded-lg p-4 shadow-xl border border-monsoon-100 flex flex-col items-start gap-3 relative">
                {/* Visible Close Button for the Floating Panel */}
                <button
                  onClick={() => setIsRoutePanelOpen(false)}
                  className="absolute top-3 right-3 p-1 text-monsoon-400 hover:text-monsoon-700 hover:bg-monsoon-100 rounded-full transition-colors cursor-pointer"
                  aria-label="Close route panel"
                  title="Close route panel"
                >
                  <X size={18} />
                </button>

                <div className="flex items-start gap-3 w-full pr-6">
                  <div className="bg-moss-500 text-white rounded-full p-2.5 shrink-0 shadow-md">
                    <Navigation size={20} className="rotate-45" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="bg-moss-100 text-moss-700 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border border-moss-200 tracking-wide">
                        {rerouteAccepted ? 'Rerouted' : 'AI Optimized'}
                      </span>
                      <p className="text-sm font-bold text-monsoon-900 truncate">
                        Routing to {selectedOrder.destination}
                      </p>
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

                {/* Vehicle Movement Simulation Engine Controls */}
                <div className="w-full bg-monsoon-50/70 border border-monsoon-100 rounded-lg p-2.5 flex flex-col gap-2 mt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-monsoon-700 uppercase tracking-wider">
                      Simulation Drive
                    </span>

                    {/* Status Badge */}
                    {simState.status === 'running' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 flex items-center gap-1 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        Running
                      </span>
                    )}
                    {simState.status === 'paused' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200">
                        Paused
                      </span>
                    )}
                    {simState.status === 'completed' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200">
                        Completed
                      </span>
                    )}
                    {simState.status === 'idle' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-monsoon-100 text-monsoon-700">
                        Ready
                      </span>
                    )}
                  </div>

                  {/* Delivery Reached Notification */}
                  {simState.deliveryReached && (
                    <div className="w-full bg-emerald-50 border border-emerald-200 rounded-md p-2 flex items-center gap-2 text-emerald-800 text-xs font-bold animate-fade-in">
                      <ShieldCheck size={16} className="text-emerald-600 shrink-0" />
                      <span>Delivery Reached safely!</span>
                    </div>
                  )}

                  {/* Progress Bar & Percentage */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-semibold text-monsoon-600">
                      <span>Route Progress</span>
                      <span className="font-mono text-monsoon-900">{simState.progressPercent}%</span>
                    </div>
                    <div className="w-full bg-monsoon-200/80 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-moss-500 h-full transition-all duration-100 rounded-full"
                        style={{ width: `${simState.progressPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Control Buttons (Start, Pause, Resume, Reset) */}
                  <div className="flex items-center gap-2 pt-1">
                    {simState.status === 'idle' && (
                      <button
                        onClick={() => simulationService.start()}
                        className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 px-3 rounded-md bg-moss-600 hover:bg-moss-700 text-white transition-colors cursor-pointer shadow-sm"
                      >
                        <PlayCircle size={14} /> Start Simulation
                      </button>
                    )}

                    {simState.status === 'running' && (
                      <button
                        onClick={() => simulationService.pause()}
                        className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 px-3 rounded-md bg-amber-500 hover:bg-amber-600 text-white transition-colors cursor-pointer shadow-sm"
                      >
                        <PauseCircle size={14} /> Pause
                      </button>
                    )}

                    {simState.status === 'paused' && (
                      <>
                        <button
                          onClick={() => simulationService.resume()}
                          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 px-3 rounded-md bg-moss-600 hover:bg-moss-700 text-white transition-colors cursor-pointer shadow-sm"
                        >
                          <PlayCircle size={14} /> Resume
                        </button>
                        <button
                          onClick={() => simulationService.reset()}
                          className="flex items-center justify-center gap-1 text-xs font-medium py-1.5 px-2.5 rounded-md border border-monsoon-200 text-monsoon-700 hover:bg-monsoon-100 transition-colors cursor-pointer"
                          title="Reset simulation"
                        >
                          <RotateCcw size={13} /> Reset
                        </button>
                      </>
                    )}

                    {simState.status === 'completed' && (
                      <button
                        onClick={() => simulationService.reset()}
                        className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 px-3 rounded-md bg-monsoon-700 hover:bg-monsoon-800 text-white transition-colors cursor-pointer shadow-sm"
                      >
                        <RotateCcw size={14} /> Reset Simulation
                      </button>
                    )}
                  </div>
                </div>

                {/* AI Route Explanation & Local Model Assistant */}
                <div className="w-full mt-1 border-t border-monsoon-100 pt-2">
                  <RouteExplanationAI order={selectedOrder} />
                </div>
              </div>
            </div>
          ) : (
            /* Reopen Floating Button when Panel is Closed */
            <button
              onClick={() => setIsRoutePanelOpen(true)}
              className="absolute top-[80px] md:top-[80px] md:left-[420px] left-4 bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-lg shadow-xl border border-monsoon-200 text-xs font-bold text-monsoon-800 hover:bg-monsoon-50 hover:text-moss-700 flex items-center gap-2 transition-all z-10 cursor-pointer animate-fade-in group"
              title="Reopen Route & AI Panel"
              aria-label="Reopen Route & AI Panel"
            >
              <Navigation size={15} className="text-moss-600 rotate-45 group-hover:scale-110 transition-transform" />
              <span>Route & AI Panel</span>
              <Sparkles size={13} className="text-moss-500" />
              {simState.status === 'running' && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-0.5" />
              )}
            </button>
          )}
        </>
      ) : (
        <div className="absolute top-[80px] md:top-[80px] md:left-[420px] left-4 right-4 md:right-auto md:w-64 bg-monsoon-900/80 backdrop-blur-md px-4 py-3 rounded-md font-medium text-white shadow-lg flex items-center justify-center animate-fade-in z-10">
          Select an order to view route
        </div>
      )}
    </div>
  );
};
