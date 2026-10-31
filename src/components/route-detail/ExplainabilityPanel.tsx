import React, { useEffect, useState } from 'react';
import { SectionHeader } from '../shared/SectionHeader';
import { mossamApi, type PredictiveHazardEstimateDto } from '../../services/api';
import { Loader2, AlertCircle } from 'lucide-react';

interface ExplainabilityPanelProps {
  routeId?: string;
  horizon?: string;
}

export const ExplainabilityPanel: React.FC<ExplainabilityPanelProps> = ({ routeId = 'RT-002', horizon = '3h' }) => {
  const [hazard, setHazard] = useState<PredictiveHazardEstimateDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchFactors = async () => {
      setLoading(true);
      try {
        const data = await mossamApi.getRouteHazard(routeId, horizon);
        if (!cancelled) {
          setHazard(data);
          setError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to load hazard factors');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchFactors();
    return () => {
      cancelled = true;
    };
  }, [routeId, horizon]);

  const allFactors = [
    ...(hazard?.landslide.factors || []),
    ...(hazard?.flood.factors || []),
  ];

  return (
    <div className="bg-monsoon-900 rounded-lg border border-monsoon-800 p-6">
      <SectionHeader title="Heuristic Risk Factors & Operational Evidence" />
      
      <p className="text-monsoon-400 text-xs mb-5 leading-relaxed">
        Risk scoring is computed using an empirical weighted multi-hazard heuristic index ($Hazard = Susceptibility \times Trigger$), evaluating terrain slope gradients and rainfall accumulation. It is not an unvalidated probabilistic model.
      </p>

      {loading && (
        <div className="flex items-center justify-center p-8 text-monsoon-400 text-xs">
          <Loader2 size={18} className="animate-spin mr-2 text-moss-400" />
          Loading contributing hazard factors...
        </div>
      )}

      {error && (
        <div className="p-3 bg-terracotta-500/10 border border-terracotta-500/30 rounded-md text-xs text-terracotta-400 flex items-center gap-2 mb-4">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {hazard && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs pb-2 border-b border-monsoon-800 text-monsoon-300">
            <span>Forecast Horizon: <strong className="text-monsoon-100">{hazard.forecast_horizon}</strong></span>
            <span>Method: <strong className="font-mono text-monsoon-200">{hazard.scoring_method}</strong></span>
            <span className="capitalize">Data: <strong className={hazard.data_freshness === 'fresh' ? 'text-moss-400' : 'text-amber-400'}>{hazard.data_freshness}</strong></span>
          </div>

          <div className="space-y-3">
            {allFactors.map((factor, i) => {
              const score = factor.impact_score !== null ? Math.round(factor.impact_score) : 0;
              const isCrit = score >= 75;
              const isHigh = score >= 50;

              return (
                <div key={i} className="flex items-center gap-3 bg-monsoon-950/40 p-2.5 rounded-md border border-monsoon-800/40">
                  <div className="w-28 shrink-0">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                      factor.status === 'unknown'
                        ? 'bg-monsoon-800 text-monsoon-400'
                        : isCrit
                          ? 'bg-terracotta-500/20 text-terracotta-400 border border-terracotta-500/30'
                          : isHigh
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : 'bg-moss-500/20 text-moss-400 border border-moss-500/30'
                    }`}>
                      {factor.status === 'unknown' ? 'Unknown' : isCrit ? 'Critical' : isHigh ? 'High Impact' : 'Moderate'}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-monsoon-100 font-medium truncate">{factor.name}</span>
                      <span className="text-monsoon-500 text-[10px]">Src: {factor.source}</span>
                    </div>
                    <div className="h-1.5 w-full bg-monsoon-950 rounded-full overflow-hidden border border-monsoon-800">
                      <div 
                        className={`h-full rounded-full ${
                          factor.status === 'unknown'
                            ? 'bg-monsoon-700'
                            : isCrit
                              ? 'bg-terracotta-500'
                              : isHigh
                                ? 'bg-amber-500'
                                : 'bg-moss-400'
                        }`}
                        style={{ width: `${factor.status === 'unknown' ? 0 : score}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="w-12 text-right text-monsoon-100 font-heading font-semibold text-xs">
                    {factor.status === 'unknown' ? 'N/A' : `${score}%`}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 p-3 bg-monsoon-950 rounded-md border border-monsoon-800 flex items-center justify-between text-xs">
            <span className="text-monsoon-400">Heuristic Risk Index:</span>
            <span className="font-bold text-terracotta-400 text-sm">
              {hazard.overall_hazard_index !== null ? `${hazard.overall_hazard_index}% (${hazard.overall_risk_level.toUpperCase()})` : 'UNKNOWN'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
