import React from 'react';

interface SectionHeaderProps {
  title: string;
  action?: React.ReactNode;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({ title, action }) => {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="font-heading text-sm font-semibold text-monsoon-100">{title}</h3>
      {action && <div>{action}</div>}
    </div>
  );
};
