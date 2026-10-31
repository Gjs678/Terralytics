import React, { useEffect, useState } from 'react';
import { MOCK_ALERTS, type AlertEvent } from '../../data/mockAlerts';
import { SectionHeader } from '../shared/SectionHeader';
import { StatusBadge } from '../shared/StatusBadge';
import { AlertTriangle, Info, BellRing, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from '../../utils/formatters';
import { mossamApi } from '../../services/api';

function useAlerts(): { alerts: AlertEvent[]; backendConnected: boolean; loading: boolean } {
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [backendConnected, setBackendConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await mossamApi.getAlerts();
        if (cancelled) return;
        setAlerts(
          data.map((a) => ({
            id: a.id,
            timestamp: a.created_at,
            title: a.title,
            description: a.description,
            severity: a.severity,
            vehicleId: a.vehicle_id || undefined,
          }))
        );
        setBackendConnected(true);
      } catch (e) {
        if (!cancelled) {
          // Backend offline - use local simulated alerts explicitly
          setAlerts(MOCK_ALERTS);
          setBackendConnected(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { alerts, backendConnected, loading };
}

const severityConfig = {
  critical: { color: 'text-terracotta-500', bg: 'bg-terracotta-500/10', border: 'border-terracotta-500/20', icon: AlertTriangle },
  high: { color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: AlertTriangle },
  medium: { color: 'text-moss-400', bg: 'bg-moss-400/10', border: 'border-moss-400/20', icon: BellRing },
  info: { color: 'text-monsoon-400', bg: 'bg-monsoon-800/50', border: 'border-monsoon-800', icon: Info },
};

export const AlertsFeed: React.FC = () => {
  const { alerts, backendConnected, loading } = useAlerts();

  return (
    <div className="flex flex-col h-full bg-monsoon-900 rounded-lg border border-monsoon-800 p-4">
      <div className="flex justify-between items-center mb-1">
        <SectionHeader title="Operational Alerts" />
        <StatusBadge tone={backendConnected ? 'live' : 'demo'}>{backendConnected ? 'Live Feed' : 'Simulated Demo'}</StatusBadge>
      </div>

      {loading && alerts.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-monsoon-400 text-xs">
          <Loader2 size={16} className="animate-spin mr-2" /> Connecting...
        </div>
      )}

      {alerts.length === 0 && !loading && (
        <div className="flex-1 flex items-center justify-center text-monsoon-500 text-xs text-center p-4">
          No active disaster alerts registered in current corridor.
        </div>
      )}

      <div className="flex-1 overflow-y-auto pr-2 space-y-2.5 custom-scrollbar">
        {alerts.map((alert) => {
          const config = severityConfig[alert.severity] || severityConfig.info;
          const Icon = config.icon;
          return (
            <div key={alert.id} className={`p-3 rounded-md border ${config.bg} ${config.border}`}>
              <div className="flex justify-between items-start mb-1">
                <div className={`flex items-center gap-1.5 ${config.color} font-medium text-xs`}>
                  <Icon size={14} />
                  {alert.title}
                </div>
                <span className="text-[11px] text-monsoon-500">
                  {formatDistanceToNow(alert.timestamp)}
                </span>
              </div>
              <p className="text-xs text-monsoon-300 mt-1 leading-snug">
                {alert.description}
              </p>
              {alert.vehicleId && (
                <div className="mt-2 text-[11px] font-medium text-monsoon-400 bg-monsoon-950/60 px-2 py-0.5 rounded inline-block border border-monsoon-800/40">
                  Vehicle: {alert.vehicleId}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
