import React from 'react';

/**
 * TERRALYTICS brand mark (vector). Inline SVG so it stays crisp at any size and
 * needs no extra network request. Decorative by default; the lockup supplies
 * the accessible name.
 */
export const BrandMark: React.FC<{ size?: number; className?: string }> = ({ size = 32, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    aria-hidden="true"
    focusable="false"
    className={className}
  >
    <rect width="32" height="32" rx="7" fill="#157A70" />
    <path
      d="M4.5 23.5c4.2-.7 5.7-8.2 10.2-8.2 4.2 0 5 5.4 8.2 5.4 2.3 0 3.6-2.1 4.6-3.3"
      stroke="#fff"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M4.5 18c3.4-.6 4.9-6.6 8.6-6.6 3.3 0 4.2 4 7 4"
      stroke="#fff"
      strokeOpacity=".6"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M4.5 12.6c2.5-.5 3.8-4.3 6.6-4.3" stroke="#fff" strokeOpacity=".35" strokeWidth="1.4" strokeLinecap="round" />
    <circle cx="24.2" cy="9.2" r="2.4" fill="#fff" />
  </svg>
);

interface BrandLockupProps {
  /** Mark size in px. */
  size?: number;
  /** Optional second line under the wordmark. */
  subtitle?: string;
  /** Wordmark colour classes; defaults suit dark surfaces. */
  textClassName?: string;
  subtitleClassName?: string;
  className?: string;
}

export const BrandLockup: React.FC<BrandLockupProps> = ({
  size = 32,
  subtitle,
  textClassName = 'text-monsoon-50',
  subtitleClassName = 'text-monsoon-400',
  className = '',
}) => (
  <span className={`inline-flex items-center gap-2.5 ${className}`}>
    <BrandMark size={size} className="shrink-0" />
    <span className="flex flex-col leading-none">
      <span className={`font-heading text-[15px] font-semibold uppercase tracking-[0.16em] ${textClassName}`}>
        TERRALYTICS
      </span>
      {subtitle && <span className={`mt-1 text-[11px] font-medium ${subtitleClassName}`}>{subtitle}</span>}
    </span>
  </span>
);
