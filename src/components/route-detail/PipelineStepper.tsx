import React from 'react';
import { Database, BrainCircuit, Route as RouteIcon, Send, CheckCircle2 } from 'lucide-react';

export const PipelineStepper: React.FC = () => {
  const steps = [
    { id: 1, label: 'Data Ingestion', desc: 'IMD + Bhuvan API sync', icon: <Database size={20} />, status: 'completed' },
    { id: 2, label: 'AI Risk Assessment', desc: 'Multi-factor risk scoring', icon: <BrainCircuit size={20} />, status: 'completed' },
    { id: 3, label: 'Route Optimization', desc: 'GraphHopper rerouting', icon: <RouteIcon size={20} />, status: 'completed' },
    { id: 4, label: 'Alert Dissemination', desc: 'Push to driver device', icon: <Send size={20} />, status: 'active' },
  ];

  return (
    <div className="w-full py-6">
      <div className="flex justify-between relative">
        <div className="absolute top-5 left-[10%] right-[10%] h-0.5 bg-monsoon-800 -z-10">
          <div className="h-full bg-moss-400 transition-all duration-1000" style={{ width: '75%' }}></div>
        </div>
        
        {steps.map((step) => (
          <div key={step.id} className="flex flex-col items-center gap-3 w-1/4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
              step.status === 'completed' 
                ? 'bg-moss-900 border-moss-400 text-moss-400' 
                : step.status === 'active'
                  ? 'bg-monsoon-900 border-terracotta-500 text-terracotta-500 animate-pulse'
                  : 'bg-monsoon-950 border-monsoon-800 text-monsoon-600'
            }`}>
              {step.icon}
            </div>
            <div className="text-center">
              <p className={`font-semibold text-sm ${
                step.status === 'completed' ? 'text-moss-400' : step.status === 'active' ? 'text-monsoon-100' : 'text-monsoon-500'
              }`}>
                {step.label}
              </p>
              <p className="text-xs text-monsoon-400 mt-1">{step.desc}</p>
            </div>
            {step.status === 'completed' && (
              <div className="mt-1 flex items-center gap-1 text-[10px] text-moss-400 uppercase tracking-wider font-bold">
                <CheckCircle2 size={12} /> Done
              </div>
            )}
            {step.status === 'active' && (
              <div className="mt-1 text-[10px] text-terracotta-500 uppercase tracking-wider font-bold animate-pulse">
                Processing...
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
