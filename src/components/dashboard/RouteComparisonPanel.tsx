import React, { useEffect, useState } from 'react';
import { GitMerge, Clock, Fuel, ShieldAlert, Footprints, AlertOctagon, CheckCircle2, XCircle, Info, RefreshCw } from 'lucide-react';
import { StatusBadge } from '../shared/StatusBadge';
import { mossamApi, type RouteComparisonDto } from '../../services/api';

interface RouteComparisonPanelProps {
  vehicleId?: string;
}

export const RouteComparisonPanel: React.FC<RouteComparisonPanelProps> = ({ vehicleId = 'TRK-8845' }) => {
  const [comparison, setComparison] = useState<RouteComparisonDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<'1h' | '3h' | '6h' | '24h'>('3h');
  const [maxWalkDistanceM, setMaxWalkDistanceM] = useState<number>(1000);
  const [showLastMileDetails, setShowLastMileDetails] = useState(false);

  useEffect(() => {
    if (!vehicleId) return;
    let cancelled = false;

    const load = async () => {
      try {
        const cmp = await mossamApi.compareRoutes(vehicleId, horizon, maxWalkDistanceM);
        if (cancelled) return;
        setComparison(cmp);
        setError(null);
      } catch (e: any) {
        if (!cancelled) {
          setError(e.message || 'Cannot reach backend service');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    setLoading(true);
    load();
    const interval = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [vehicleId, horizon, maxWalkDistanceM]);

  const standardRoute = comparison?.standard_route;
  const aiRoute = comparison?.ai_route;
  const standardHazard = comparison?.standard_hazard;
  const lastMile = comparison?.last_mile_option;
  const isImpassable = comparison?.is_impassable || false;
  const closureReasons = comparison?.closure_reasons || [];

  return (
    <div className="bg-monsoon-900 rounded-lg border border-monsoon-800 p-4 h-full flex flex-col overflow-y-auto custom-scrollbar">
      {/* Header with Vehicle ID, Controls for Horizon and Walk Limit */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2 border-b border-monsoon-800/60">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-heading font-semibold text-monsoon-100 text-sm flex items-center gap-1.5">
              Route Analysis: {vehicleId}
              {loading && <RefreshCw size={12} className="animate-spin text-moss-400" />}
            </h3>
            {comparison && (
              <StatusBadge tone={comparison.standard_hazard?.data_freshness === 'fresh' ? 'live' : 'demo'}>
                {comparison.standard_hazard?.data_freshness === 'fresh' ? 'Live Weather' : 'Simulated Scenario'}
              </StatusBadge>
            )}
          </div>
          <p className="text-[11px] text-monsoon-400">
            {standardRoute ? `${standardRoute.origin_name} → ${standardRoute.destination_name} (${standardRoute.name})` : 'Loading corridor...'}
          </p>
        </div>

        {/* Forecast Horizon and Walking Distance Selectors */}
        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center bg-monsoon-950 p-0.5 rounded-lg border border-monsoon-800">
            {(['1h', '3h', '6h', '24h'] as const).map((h) => (
              <button
                key={h}
                onClick={() => setHorizon(h)}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                  horizon === h
                    ? 'bg-moss-600 text-white'
                    : 'text-monsoon-400 hover:text-monsoon-200'
                }`}
                title={`Forecast Window: ${h}`}
              >
                {h}
              </button>
            ))}
          </div>

          <div className="flex items-center bg-monsoon-950 p-0.5 rounded-lg border border-monsoon-800">
            <button
              onClick={() => setMaxWalkDistanceM(500)}
              className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                maxWalkDistanceM === 500 ? 'bg-monsoon-700 text-white' : 'text-monsoon-400 hover:text-monsoon-200'
              }`}
            >
              500m
            </button>
            <button
              onClick={() => setMaxWalkDistanceM(1000)}
              className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                maxWalkDistanceM === 1000 ? 'bg-monsoon-700 text-white' : 'text-monsoon-400 hover:text-monsoon-200'
              }`}
            >
              1km
            </button>
          </div>
        </div>
      </div>

      {/* Confirmed Hard Closure Warning Banner */}
      {isImpassable && (
        <div className="bg-terracotta-500/20 border-2 border-terracotta-500 text-terracotta-400 text-xs p-3 rounded-md mb-3 animate-pulse">
          <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider mb-1">
            <AlertOctagon size={16} /> Hard Constraint: Corridor Impassable
          </div>
          <p className="text-monsoon-200">
            Confirmed blockage on standard corridor. Ordinary traffic cannot pass.
          </p>
          {closureReasons.map((reason, idx) => (
            <p key={idx} className="text-terracotta-300 font-mono mt-1 text-[11px]">• {reason}</p>
          ))}
        </div>
      )}

      {/* AI Recommendation Reason */}
      {comparison?.explanation && (
        <div className="bg-moss-900/20 border border-moss-500/30 text-monsoon-200 text-xs p-3 rounded-md mb-3 flex items-start gap-2">
          <ShieldAlert size={16} className="text-moss-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-moss-400 block mb-0.5">Route Recommendation Analysis:</span>
            <p className="leading-relaxed">{comparison.explanation}</p>
          </div>
        </div>
      )}

      {/* Error / Loading States */}
      {error && !comparison && (
        <div className="p-4 bg-terracotta-500/10 border border-terracotta-500/30 rounded-md text-xs text-terracotta-400 flex items-center justify-between">
          <span>Failed to connect to backend: {error}</span>
          <button onClick={() => setLoading(true)} className="flex items-center gap-1 text-monsoon-300 underline">
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      )}

      {/* Standard Route vs AI Route Cards */}
      {standardRoute && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1 mb-3">
          {/* Standard Route Card */}
          <div className={`rounded-md p-3 border flex flex-col justify-between ${
            isImpassable ? 'bg-monsoon-950/80 border-terracotta-500/50' : 'bg-monsoon-900/50 border-monsoon-800'
          }`}>
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="font-heading font-semibold text-monsoon-200 text-xs truncate max-w-[170px]">
                  {standardRoute.name}
                </span>
                <span className={`text-[11px] uppercase font-bold px-1.5 py-0.5 rounded ${
                  isImpassable ? 'bg-terracotta-500/20 text-terracotta-400 border border-terracotta-500/40' : 'bg-monsoon-800 text-monsoon-400'
                }`}>
                  {isImpassable ? 'IMPASSABLE' : 'STANDARD'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs mb-3 bg-monsoon-950/60 p-2 rounded-lg border border-monsoon-800/40">
                <div>
                  <span className="block text-[11px] text-monsoon-500 flex items-center justify-center gap-1"><GitMerge size={10} /> Dist</span>
                  <span className="text-monsoon-100 font-semibold">{standardRoute.distance_km} km</span>
                </div>
                <div>
                  <span className="block text-[11px] text-monsoon-500 flex items-center justify-center gap-1"><Clock size={10} /> ETA</span>
                  <span className="text-monsoon-100 font-semibold">{standardRoute.travel_time_hours}h</span>
                </div>
                <div>
                  <span className="block text-[11px] text-monsoon-500 flex items-center justify-center gap-1"><Fuel size={10} /> Fuel</span>
                  <span className="text-monsoon-100 font-semibold">{Math.round(standardRoute.distance_km * 0.28)}L</span>
                </div>
              </div>

              {/* Multi-hazard Breakdown Badges */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-monsoon-400 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span> Landslide Risk ({horizon})
                  </span>
                  <span className="font-bold text-amber-400">
                    {standardHazard?.landslide.risk_index !== null ? `${Math.round(standardHazard?.landslide.risk_index || 0)}/100` : 'Unknown'}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-monsoon-400 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span> Flood Risk ({horizon})
                  </span>
                  <span className="font-bold text-blue-400">
                    {standardHazard?.flood.risk_index !== null ? `${Math.round(standardHazard?.flood.risk_index || 0)}/100` : 'Unknown'}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs pt-1 border-t border-monsoon-800/50">
                  <span className="text-monsoon-300 font-medium">Heuristic Risk Index</span>
                  <span className="font-bold text-terracotta-400 text-sm">
                    {standardHazard?.overall_hazard_index !== null ? `${Math.round(standardHazard?.overall_hazard_index || 0)}%` : 'Unknown'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* AI Recommended Route Card */}
          {aiRoute ? (
            <div className="bg-moss-900/20 rounded-md p-3 border border-moss-500/40 flex flex-col justify-between relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-moss-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-bl-lg tracking-wider">
                RECOMMENDED ALTERNATIVE
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="font-heading font-semibold text-moss-300 text-xs truncate max-w-[170px]">
                    {aiRoute.name}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs mb-3 bg-moss-950/40 p-2 rounded-lg border border-moss-800/40">
                  <div>
                    <span className="block text-[11px] text-monsoon-400">Dist</span>
                    <span className="text-monsoon-100 font-semibold">{aiRoute.distance_km} km</span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-monsoon-400">ETA</span>
                    <span className="text-monsoon-100 font-semibold">{aiRoute.travel_time_hours}h</span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-monsoon-400">Fuel</span>
                    <span className="text-monsoon-100 font-semibold">{Math.round(aiRoute.distance_km * 0.28)}L</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-monsoon-300">Landslide Risk</span>
                    <span className="font-bold text-moss-400">
                      {comparison?.ai_hazard?.landslide.risk_index !== null ? `${Math.round(comparison?.ai_hazard?.landslide.risk_index || 0)}/100` : 'Low'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-monsoon-300">Flood Risk</span>
                    <span className="font-bold text-moss-400">
                      {comparison?.ai_hazard?.flood.risk_index !== null ? `${Math.round(comparison?.ai_hazard?.flood.risk_index || 0)}/100` : 'Low'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-xs pt-1 border-t border-moss-800/50">
                    <span className="text-moss-300 font-medium">Heuristic Risk Index</span>
                    <span className="font-bold text-moss-400 text-sm">
                      {comparison?.ai_hazard?.overall_hazard_index !== null ? `${Math.round(comparison?.ai_hazard?.overall_hazard_index || aiRoute.hazard_risk)}%` : `${Math.round(aiRoute.hazard_risk)}%`}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-monsoon-900 rounded-md p-4 border border-monsoon-800 flex flex-col justify-center items-center text-center">
              <CheckCircle2 size={24} className="text-moss-400 mb-2" />
              <h5 className="font-heading font-semibold text-monsoon-200 text-xs mb-1">
                Standard Corridor Operating Safely
              </h5>
              <p className="text-[11px] text-monsoon-400 leading-snug">
                No active severe incidents or confirmed closures on this route. AI reroute not required.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Feature 2: Safe Vehicle-to-Foot Last-Mile Routing Assessment */}
      {lastMile && (
        <div className="border border-monsoon-800 bg-monsoon-950/70 rounded-md p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Footprints size={16} className={lastMile.is_accepted ? 'text-moss-400' : 'text-monsoon-400'} />
              <span className="text-xs font-heading font-semibold text-monsoon-200">
                Safe Vehicle-to-Foot Last-Mile Evaluation
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                lastMile.status === 'accepted'
                  ? 'bg-moss-500/20 text-moss-400 border border-moss-500/40'
                  : lastMile.status === 'unverified'
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                    : 'bg-monsoon-800 text-monsoon-400'
              }`}>
                {lastMile.status === 'accepted' ? 'Accepted' : lastMile.status === 'unverified' ? 'Unverified / No Foot Router' : 'Rejected'}
              </span>
              <button
                onClick={() => setShowLastMileDetails(!showLastMileDetails)}
                className="text-[11px] text-monsoon-400 hover:text-monsoon-200 underline"
              >
                {showLastMileDetails ? 'Hide' : 'Details'}
              </button>
            </div>
          </div>

          {/* Core Decision Summary */}
          <div className="space-y-1 text-xs">
            {lastMile.reasons.map((reason, i) => (
              <div key={i} className="flex items-start gap-1.5 text-monsoon-300 text-[11px]">
                {lastMile.is_accepted ? (
                  <CheckCircle2 size={12} className="text-moss-400 shrink-0 mt-0.5" />
                ) : lastMile.status === 'unverified' ? (
                  <Info size={12} className="text-amber-400 shrink-0 mt-0.5" />
                ) : (
                  <XCircle size={12} className="text-terracotta-400 shrink-0 mt-0.5" />
                )}
                <span>{reason}</span>
              </div>
            ))}
          </div>

          {/* Expanded Metrics when verified or requested */}
          {showLastMileDetails && (
            <div className="mt-2 pt-2 border-t border-monsoon-800/60 grid grid-cols-2 md:grid-cols-4 gap-2 text-center text-xs text-monsoon-300">
              <div className="bg-monsoon-900/40 p-1.5 rounded-lg">
                <span className="block text-[11px] text-monsoon-500">Candidate Stop</span>
                <span className="font-semibold text-monsoon-200 truncate block">
                  {lastMile.stopping_point?.name || 'Near Destination'}
                </span>
              </div>
              <div className="bg-monsoon-900/40 p-1.5 rounded-lg">
                <span className="block text-[11px] text-monsoon-500">Walk Distance</span>
                <span className="font-semibold text-monsoon-200">
                  {lastMile.walking_distance_m !== null ? `${lastMile.walking_distance_m}m` : 'N/A'}
                </span>
              </div>
              <div className="bg-monsoon-900/40 p-1.5 rounded-lg">
                <span className="block text-[11px] text-monsoon-500">Walk ETA</span>
                <span className="font-semibold text-monsoon-200">
                  {lastMile.walking_time_minutes !== null ? `~${lastMile.walking_time_minutes} min` : 'N/A'}
                </span>
              </div>
              <div className="bg-monsoon-900/40 p-1.5 rounded-lg">
                <span className="block text-[11px] text-monsoon-500">Detour Avoided</span>
                <span className="font-semibold text-moss-400">
                  {lastMile.vehicle_detour_avoided_km !== null ? `${lastMile.vehicle_detour_avoided_km} km` : '0 km'}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
