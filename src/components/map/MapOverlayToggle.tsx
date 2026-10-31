import React from 'react';
import { Layers } from 'lucide-react';

interface OverlayToggleProps {
  label: string;
  isActive: boolean;
  onToggle: (val: boolean) => void;
  colorClass: string;
}

export const MapOverlayToggle: React.FC<OverlayToggleProps> = ({ label, isActive, onToggle, colorClass }) => {
  return (
    <button
      onClick={() => onToggle(!isActive)}
      aria-pressed={isActive}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-semibold shadow-md transition-colors ${
        isActive
          ? `bg-monsoon-900 border-${colorClass} text-white`
          : 'bg-monsoon-900/90 border-monsoon-700 text-monsoon-300 hover:bg-monsoon-800 hover:text-white'
      }`}
    >
      <Layers size={14} className={isActive ? `text-${colorClass}` : ''} />
      {label}
    </button>
  );
};
