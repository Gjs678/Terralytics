import React from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { MOCK_TREND_DATA } from '../../data/mockImpactStats';
import { SectionHeader } from '../shared/SectionHeader';

export const TrendChart: React.FC = () => {
  return (
    <div className="flex flex-col h-full bg-monsoon-900 rounded-lg border border-monsoon-800 p-4">
      <SectionHeader title="Risk vs Reroutes (30 Days)" />
      <div className="flex-1 min-h-[200px] w-full mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={MOCK_TREND_DATA} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorIncidents" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#e5705f" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#e5705f" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorReroutes" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3fb7a8" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#3fb7a8" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <XAxis dataKey="date" stroke="#8a9db3" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="#8a9db3" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#0d1522', borderColor: '#37475c', color: '#f5f7fa' }}
              itemStyle={{ color: '#f5f7fa' }}
            />
            <Area type="monotone" dataKey="incidents" stroke="#e5705f" fillOpacity={1} fill="url(#colorIncidents)" name="Incidents" />
            <Area type="monotone" dataKey="reroutes" stroke="#3fb7a8" fillOpacity={1} fill="url(#colorReroutes)" name="Successful Reroutes" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
