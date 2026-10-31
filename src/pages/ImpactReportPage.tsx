import React from 'react';
import { MOCK_IMPACT_STATS } from '../data/mockImpactStats';
import { StatBlock } from '../components/shared/StatBlock';
import { Download, Share2, Leaf, ShieldCheck, Map } from 'lucide-react';
import { TrendChart } from '../components/dashboard/TrendChart';

export const ImpactReportPage: React.FC = () => {
  return (
    <div className="max-w-5xl mx-auto p-8 animate-fade-in text-monsoon-100">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="font-heading text-3xl font-bold mb-2">Impact Report</h2>
          <p className="text-monsoon-400">Monthly summary of TERRALYTICS logistics optimization across the NER.</p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-monsoon-900 border border-monsoon-800 rounded-lg hover:bg-monsoon-800 transition-colors">
            <Share2 size={18} /> Share
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-moss-600 text-white border border-moss-500 rounded-lg hover:bg-moss-500 transition-colors">
            <Download size={18} /> Export PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-monsoon-900 rounded-lg border border-monsoon-800 p-6 flex flex-col items-center text-center">
          <div className="p-4 bg-moss-900/50 rounded-full text-moss-400 mb-4">
            <ShieldCheck size={32} />
          </div>
          <h3 className="text-xl font-heading mb-1 text-monsoon-50">Logistics Reliability</h3>
          <p className="text-monsoon-400 text-sm mb-4">Ensured vital supply chains remained unbroken during extreme weather.</p>
          <div className="w-full flex justify-around">
            <StatBlock label="On-Time Delivery" value={`${MOCK_IMPACT_STATS.onTimeDeliveryPercent}%`} />
            <StatBlock label="Villages Served" value={MOCK_IMPACT_STATS.villagesReached} />
          </div>
        </div>

        <div className="bg-monsoon-900 rounded-lg border border-monsoon-800 p-6 flex flex-col items-center text-center">
          <div className="p-4 bg-terracotta-500/20 rounded-full text-terracotta-500 mb-4">
            <Map size={32} />
          </div>
          <h3 className="text-xl font-heading mb-1 text-monsoon-50">Risk Mitigation</h3>
          <p className="text-monsoon-400 text-sm mb-4">AI preemptively routed around predicted infrastructure failure.</p>
          <div className="w-full flex justify-around">
            <StatBlock label="Corridors Avoided" value={MOCK_IMPACT_STATS.corridorsAvoided} />
            <StatBlock label="Incident Reduction" value="45%" trend="down" />
          </div>
        </div>

        <div className="bg-monsoon-900 rounded-lg border border-monsoon-800 p-6 flex flex-col items-center text-center">
          <div className="p-4 bg-amber-500/20 rounded-full text-amber-500 mb-4">
            <Leaf size={32} />
          </div>
          <h3 className="text-xl font-heading mb-1 text-monsoon-50">Environmental</h3>
          <p className="text-monsoon-400 text-sm mb-4">Reduced idle time and optimized paths leading to lower emissions.</p>
          <div className="w-full flex justify-around">
            <StatBlock label="Fuel Saved" value={`${MOCK_IMPACT_STATS.fuelSavedLiters}L`} />
            <StatBlock label="CO₂ Avoided" value={`${MOCK_IMPACT_STATS.co2SavedKg}kg`} />
          </div>
        </div>
      </div>

      <div className="bg-monsoon-900 rounded-lg border border-monsoon-800 p-6 h-80">
        <TrendChart />
      </div>
    </div>
  );
};
