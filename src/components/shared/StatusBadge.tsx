import React from 'react';

type Tone = 'live' | 'demo';

const tones: Record<Tone, string> = {
  live: 'text-moss-300 bg-moss-500/10 ring-moss-500/30',
  demo: 'text-amber-300 bg-amber-500/10 ring-amber-500/30',
};

/** Minimal data-source chip: a coloured dot plus a short label. */
export const StatusBadge: React.FC<{ tone: Tone; children: React.ReactNode; className?: string }> = ({
  tone,
  children,
  className = '',
}) => (
  <span
    className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold leading-4 ring-1 ring-inset ${tones[tone]} ${className}`}
  >
    <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
    {children}
  </span>
);
