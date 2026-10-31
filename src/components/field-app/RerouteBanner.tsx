import React from 'react';
import { MapPin, ArrowRight } from 'lucide-react';

interface RerouteBannerProps {
  onAccept: () => void;
  reason?: string;
  distanceDeltaKm?: number;
  etaDeltaHours?: number;
}

export const RerouteBanner: React.FC<RerouteBannerProps> = ({ onAccept, reason, distanceDeltaKm, etaDeltaHours }) => {
  return (
    <div className="mx-4 mt-4 bg-white rounded-lg p-4 border-2 border-terracotta-500 shadow-lg relative overflow-hidden animate-slide-up">
      <div className="absolute top-0 left-0 w-2 h-full bg-terracotta-500"></div>
      
      <div className="flex justify-between items-start mb-2 pl-2">
        <h3 className="font-heading font-bold text-terracotta-600">Reroute Required</h3>
        <span className="bg-terracotta-500/10 text-terracotta-600 text-[10px] font-bold px-2 py-0.5 rounded uppercase">New</span>
      </div>
      
      <p className="text-sm text-monsoon-700 pl-2 mb-4 leading-tight">
        {reason || 'A hazard was detected on the current route. A safer alternative route is available.'}
      </p>
      
      {(distanceDeltaKm !== undefined || etaDeltaHours !== undefined) && (
        <div className="flex items-center gap-2 pl-2 mb-4 text-xs font-medium text-monsoon-600">
          {distanceDeltaKm !== undefined && (
            <span className="flex items-center gap-1"><MapPin size={12}/> +{distanceDeltaKm.toFixed(0)}km</span>
          )}
          {etaDeltaHours !== undefined && (
            <span className="flex items-center gap-1"><ArrowRight size={12}/> +{Math.round(etaDeltaHours * 60)}mins</span>
          )}
        </div>
      )}
      
      <button 
        onClick={onAccept}
        className="w-full bg-moss-500 hover:bg-moss-600 text-white font-semibold py-3 rounded-md transition-colors shadow-md active:scale-95"
      >
        Accept New Route
      </button>
    </div>
  );
};
