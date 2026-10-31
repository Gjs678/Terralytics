import React, { useEffect, useState } from 'react';
import { NERMap } from '../components/map/NERMap';
import { MapOverlayToggle } from '../components/map/MapOverlayToggle';
import { AlertsFeed } from '../components/dashboard/AlertsFeed';
import { FleetList } from '../components/dashboard/FleetList';
import { RouteComparisonPanel } from '../components/dashboard/RouteComparisonPanel';
import { SimulateIncidentPanel } from '../components/dashboard/SimulateIncidentPanel';
import { StatBlock } from '../components/shared/StatBlock';
import { StatusBadge } from '../components/shared/StatusBadge';
import { TrendChart } from '../components/dashboard/TrendChart';
import { MOCK_IMPACT_STATS } from '../data/mockImpactStats';
import { WeatherWidget } from '../components/shared/WeatherWidget';
import { mossamApi, type IncidentResponseDto } from '../services/api';

function useImpactStats() {
  const [stats, setStats] = useState({
    onTimeDeliveryPercent: MOCK_IMPACT_STATS.onTimeDeliveryPercent,
    corridorsAvoided: MOCK_IMPACT_STATS.corridorsAvoided,
    fuelSavedLiters: MOCK_IMPACT_STATS.fuelSavedLiters,
    co2SavedKg: MOCK_IMPACT_STATS.co2SavedKg,
    villagesReached: MOCK_IMPACT_STATS.villagesReached,
  });
  const [isLive, setIsLive] = useState(false);

  const refresh = () => {
    mossamApi
      .getImpactStats()
      .then((s) => {
        setStats({
          onTimeDeliveryPercent: s.on_time_delivery_percent,
          corridorsAvoided: s.corridors_avoided,
          fuelSavedLiters: Math.round(s.fuel_saved_liters),
          co2SavedKg: Math.round(s.co2_saved_kg),
          villagesReached: s.villages_reached,
        });
        setIsLive(true);
      })
      .catch(() => {
        // Backend unavailable - preserve baseline stats with simulated status
        setIsLive(false);
      });
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 6000);
    return () => clearInterval(interval);
  }, []);

  return { stats, isLive, refresh };
}

const kpiTile = 'rounded-lg border border-monsoon-800 bg-monsoon-900 px-4 py-3';

export const ControlRoomDashboardPage: React.FC = () => {
  const [showLandslide, setShowLandslide] = useState(true);
  const [showFlood, setShowFlood] = useState(false);
  const [showWeather, setShowWeather] = useState(false);
  const [focusedVehicleId, setFocusedVehicleId] = useState('TRK-8845');
  const { stats, isLive, refresh } = useImpactStats();

  const handleIncidentTriggered = (result: IncidentResponseDto) => {
    refresh();
    if (result.decision?.vehicle_id) setFocusedVehicleId(result.decision.vehicle_id);
  };

  return (
    <div className="p-3 sm:p-4 lg:p-5 space-y-4 animate-fade-in">
      {/* 1. Key indicators */}
      <section aria-labelledby="kpi-heading">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="kpi-heading" className="text-xs font-semibold uppercase tracking-[0.14em] text-monsoon-400">
            Key indicators
          </h2>
          <StatusBadge tone={isLive ? 'live' : 'demo'}>{isLive ? 'Live' : 'Baseline'}</StatusBadge>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <div className={`${kpiTile} border-moss-700/70`}>
            <StatBlock label="On-Time Delivery" value={`${stats.onTimeDeliveryPercent}%`} trend="up" highlight />
          </div>
          <div className={kpiTile}>
            <StatBlock label="Corridors Avoided" value={stats.corridorsAvoided} />
          </div>
          <div className={kpiTile}>
            <StatBlock label="Fuel Saved" value={`${stats.fuelSavedLiters} L`} trend="up" />
          </div>
          <div className={kpiTile}>
            <StatBlock label="CO₂ Saved" value={`${stats.co2SavedKg} kg`} trend="up" />
          </div>
          <div className={`${kpiTile} col-span-2 md:col-span-1`}>
            <StatBlock label="Villages Reached" value={stats.villagesReached} />
          </div>
        </div>
      </section>

      {/* 2. Operational picture: map first, alerts and fleet alongside */}
      <section
        aria-label="Operational map, alerts and fleet"
        className="grid grid-cols-1 gap-4 lg:h-[clamp(480px,calc(100dvh-15rem),780px)] lg:grid-cols-[minmax(300px,21rem)_minmax(0,1fr)]"
      >
        <div className="relative order-1 h-[60dvh] min-h-[380px] overflow-hidden rounded-lg border border-monsoon-800 bg-monsoon-900 lg:order-2 lg:h-auto">
          {/* Map overlay controls */}
          <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-start justify-between gap-2">
            <div className="pointer-events-auto inline-flex max-w-full items-center gap-2 rounded-md border border-monsoon-700 bg-monsoon-900/95 px-3 py-1.5 text-xs font-semibold text-monsoon-100 shadow-md">
              <span className="h-2 w-2 shrink-0 rounded-full bg-moss-400" aria-hidden="true" />
              <span>TERRALYTICS Predictive Hazard &amp; Multi-Modal Routing Engine</span>
            </div>

            <div className="pointer-events-auto flex flex-wrap gap-2">
              <MapOverlayToggle
                label="Landslide Risk"
                isActive={showLandslide}
                onToggle={setShowLandslide}
                colorClass="terracotta-500"
              />
              <MapOverlayToggle
                label="Flood Risk"
                isActive={showFlood}
                onToggle={setShowFlood}
                colorClass="blue-500"
              />
              <MapOverlayToggle
                label="Weather (IMD)"
                isActive={showWeather}
                onToggle={setShowWeather}
                colorClass="monsoon-400"
              />
            </div>
          </div>

          <NERMap
            showLandslideRisk={showLandslide}
            showFloodRisk={showFlood}
            showWeather={showWeather}
          />
        </div>

        <div className="order-2 flex min-h-0 flex-col gap-4 lg:order-1">
          <div className="shrink-0">
            <WeatherWidget />
          </div>
          <div className="h-80 lg:h-auto lg:min-h-0 lg:flex-1">
            <AlertsFeed />
          </div>
          <div className="h-80 lg:h-auto lg:min-h-0 lg:flex-1">
            <FleetList />
          </div>
        </div>
      </section>

      {/* 3. Analysis and controls */}
      <section aria-label="Route analysis, incident controls and trends" className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="min-h-[22rem] xl:col-span-7">
          <RouteComparisonPanel vehicleId={focusedVehicleId} />
        </div>
        <div className="flex flex-col gap-4 xl:col-span-5">
          <SimulateIncidentPanel onTriggered={handleIncidentTriggered} />
          <div className="h-72">
            <TrendChart />
          </div>
        </div>
      </section>
    </div>
  );
};
