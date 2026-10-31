import React from 'react';

interface StatBlockProps {
  label: string;
  value: string | number;
  subtext?: string;
  trend?: 'up' | 'down' | 'neutral';
  highlight?: boolean;
}

export const StatBlock: React.FC<StatBlockProps> = ({ label, value, subtext, trend, highlight }) => {
  return (
    <div className="flex flex-col">
      <span className="text-monsoon-400 text-xs font-semibold uppercase tracking-wide mb-1">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className={`font-heading text-lg sm:text-2xl font-semibold tabular-nums ${highlight ? 'text-moss-400' : 'text-monsoon-50'}`}>
          {value}
        </span>
        {trend && (
          <span className={`text-sm ${trend === 'up' ? 'text-moss-400' : trend === 'down' ? 'text-terracotta-400' : 'text-monsoon-400'}`}>
            {trend === 'up' ? '↗' : trend === 'down' ? '↘' : '→'}
          </span>
        )}
      </div>
      {subtext && <span className="text-monsoon-400 text-xs mt-1">{subtext}</span>}
    </div>
  );
};
