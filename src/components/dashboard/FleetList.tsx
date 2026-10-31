import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MOCK_FLEET, type Vehicle } from '../../data/mockFleet';
import { SectionHeader } from '../shared/SectionHeader';
import { StatusBadge } from '../shared/StatusBadge';
import { Signal, SignalZero, WifiOff, Loader2 } from 'lucide-react';
import { mossamApi } from '../../services/api';

function useFleet(): { fleet: Vehicle[]; backendConnected: boolean; loading: boolean } {
  const [fleet, setFleet] = useState<Vehicle[]>([]);
  const [backendConnected, setBackendConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await mossamApi.getFleet();
        if (cancelled) return;
        setFleet(
          data.map((v) => ({
            id: v.id,
            driverName: v.driver_name,
            status: v.status as any,
            currentLocation: [v.lat, v.lng],
            lastKnownLocationName: v.last_known_location_name,
            destination: v.destination,
            eta: v.eta,
            connectivity: v.connectivity as any,
            currentRouteId: v.current_route_id || undefined,
          }))
        );
        setBackendConnected(true);
      } catch (e) {
        if (!cancelled) {
          // Fall back to baseline mock fleet explicitly
          setFleet(MOCK_FLEET);
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

  return { fleet, backendConnected, loading };
}

const statusStyles: Record<string, string> = {
  'in-transit': 'text-moss-400 bg-moss-400/10 border-moss-400/20',
  'rerouted': 'text-terracotta-500 bg-terracotta-500/10 border-terracotta-500/20',
  'delayed': 'text-amber-500 bg-amber-500/10 border-amber-500/20',
  'offline': 'text-monsoon-400 bg-monsoon-800 border-monsoon-700',
};

const getConnectivityIcon = (status: string) => {
  switch (status) {
    case 'online': return <Signal size={14} className="text-moss-400" />;
    case 'offline-sms': return <SignalZero size={14} className="text-amber-500" />;
    default: return <WifiOff size={14} className="text-terracotta-500" />;
  }
};

export const FleetList: React.FC = () => {
  const { fleet, backendConnected, loading } = useFleet();

  return (
    <div className="flex flex-col h-full bg-monsoon-900 rounded-lg border border-monsoon-800 p-4">
      <div className="flex justify-between items-center mb-1">
        <SectionHeader title="Active Fleet" />
        <StatusBadge tone={backendConnected ? 'live' : 'demo'}>{backendConnected ? 'Live Fleet' : 'Cached Demo'}</StatusBadge>
      </div>

      {loading && fleet.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-monsoon-400 text-xs">
          <Loader2 size={16} className="animate-spin mr-2" /> Connecting...
        </div>
      )}

      <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
        {fleet.map((vehicle) => (
          <Link
            key={vehicle.id}
            to={`/route-detail?vehicle_id=${vehicle.id}`}
            className="block p-3 bg-monsoon-900/40 rounded-md border border-monsoon-800 hover:bg-monsoon-800/80 transition-colors cursor-pointer group"
          >
            <div className="flex justify-between items-center mb-2">
              <span className="font-heading font-medium text-monsoon-100 group-hover:text-white transition-colors">
                {vehicle.id}
              </span>
              <span className={`text-[11px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border ${statusStyles[vehicle.status] || statusStyles['in-transit']}`}>
                {vehicle.status}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-monsoon-400 mb-2">
              <div>
                <span className="block text-monsoon-500 mb-0.5">Driver</span>
                <span className="text-monsoon-300">{vehicle.driverName}</span>
              </div>
              <div>
                <span className="block text-monsoon-500 mb-0.5">Dest & ETA</span>
                <span className="text-monsoon-300">{vehicle.destination} ({vehicle.eta})</span>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-monsoon-800/50">
              <span className="truncate flex-1 pr-2 text-monsoon-500">{vehicle.lastKnownLocationName}</span>
              <div className="flex items-center gap-1 shrink-0 bg-monsoon-950 px-1.5 py-0.5 rounded-full border border-monsoon-800">
                {getConnectivityIcon(vehicle.connectivity)}
                <span className="text-[11px] capitalize text-monsoon-400">{vehicle.connectivity.replace('-', ' ')}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};
