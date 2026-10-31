import React from 'react';
import { PipelineStepper } from '../components/route-detail/PipelineStepper';
import { ExplainabilityPanel } from '../components/route-detail/ExplainabilityPanel';
import { RouteComparisonPanel } from '../components/dashboard/RouteComparisonPanel';
import { ChevronLeft } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';

const VEHICLE_TO_ROUTE: Record<string, { routeId: string; corridor: string }> = {
  'TRK-9012': { routeId: 'RT-001', corridor: 'Guwahati to Shillong (NH-40)' },
  'TRK-8845': { routeId: 'RT-002', corridor: 'Itanagar to Ziro (NH-13)' },
  'TRK-7721': { routeId: 'RT-003', corridor: 'Sela Pass to Tawang' },
  'TRK-5534': { routeId: 'RT-004', corridor: 'Silchar to Aizawl Corridor' },
};

export const RouteDetailPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const vehicleId = searchParams.get('vehicle_id') || 'TRK-8845';
  const info = VEHICLE_TO_ROUTE[vehicleId] || { routeId: 'RT-002', corridor: `${vehicleId} Active Corridor` };

  return (
    <div className="max-w-6xl mx-auto p-8 animate-fade-in text-monsoon-100">
      <div className="mb-6 flex items-center gap-4">
        <Link to="/control-room" className="p-2 bg-monsoon-900 hover:bg-monsoon-800 rounded-lg text-monsoon-400 transition-colors">
          <ChevronLeft size={20} />
        </Link>
        <div>
          <h2 className="font-heading text-2xl font-bold">Route Incident Investigation</h2>
          <p className="text-monsoon-400 text-sm">{vehicleId} • {info.corridor}</p>
        </div>
      </div>

      <div className="bg-monsoon-900 rounded-lg border border-monsoon-800 p-6 mb-6">
        <h3 className="font-heading text-lg font-semibold mb-4 text-monsoon-100">Disaster-Aware Routing Pipeline</h3>
        <PipelineStepper />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ExplainabilityPanel routeId={info.routeId} />
        <RouteComparisonPanel vehicleId={vehicleId} />
      </div>
    </div>
  );
};
