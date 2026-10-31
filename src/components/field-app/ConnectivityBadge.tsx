import React, { useEffect, useState } from 'react';
import { Signal, SignalZero, WifiOff } from 'lucide-react';
import { isOnline, pendingReportCount, syncQueuedReports } from '../../services/offlineQueue';

interface ConnectivityBadgeProps {
  // Optional override (e.g. simulate a vehicle-specific connectivity state).
  // If omitted, the badge reflects the browser's real navigator.onLine status,
  // which is what drives the offline blockage-report queue/sync demo.
  status?: 'online' | 'offline-sms' | 'no-signal';
}

export const ConnectivityBadge: React.FC<ConnectivityBadgeProps> = ({ status }) => {
  const [online, setOnline] = useState(isOnline());
  const [pending, setPending] = useState(pendingReportCount());
  const [justSynced, setJustSynced] = useState(0);

  useEffect(() => {
    const handleOnline = async () => {
      setOnline(true);
      const synced = await syncQueuedReports();
      if (synced > 0) setJustSynced(synced);
      setPending(pendingReportCount());
      if (synced > 0) setTimeout(() => setJustSynced(0), 4000);
    };
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    const interval = setInterval(() => setPending(pendingReportCount()), 3000);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  const resolvedStatus = status ?? (online ? 'online' : 'no-signal');

  const config = {
    'online': { icon: <Signal size={16} />, text: 'Online', color: 'bg-moss-600 text-white', ring: 'ring-moss-200' },
    'offline-sms': { icon: <SignalZero size={16} />, text: 'Offline (SMS)', color: 'bg-amber-700 text-white', ring: 'ring-amber-200 animate-pulse' },
    'no-signal': { icon: <WifiOff size={16} />, text: pending > 0 ? `Offline (${pending} queued)` : 'Offline', color: 'bg-terracotta-600 text-white', ring: 'ring-terracotta-200' },
  };

  const current = config[resolvedStatus];

  return (
    <div className="flex flex-col items-end gap-1">
      <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-wide shadow-sm ring-2 ${current.color} ${current.ring}`}>
        {current.icon}
        {current.text}
      </div>
      {justSynced > 0 && (
        <div className="text-[10px] font-semibold text-moss-600 bg-moss-50 px-2 py-0.5 rounded-full border border-moss-200 animate-fade-in">
          Synced {justSynced} queued report{justSynced > 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
};
