import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, CloudOff } from 'lucide-react';
import { submitOrQueueReport } from '../../services/offlineQueue';

interface ReportBlockageButtonProps {
  vehicleId?: string;
  lat: number;
  lng: number;
}

const TYPES = [
  { value: 'road_blockage', label: 'Road Blockage' },
  { value: 'landslide', label: 'Landslide' },
  { value: 'flood', label: 'Flood' },
  { value: 'accident', label: 'Accident' },
  { value: 'heavy_rainfall', label: 'Heavy Rainfall' },
];

export const ReportBlockageButton: React.FC<ReportBlockageButtonProps> = ({ vehicleId, lat, lng }) => {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('road_blockage');
  const [severity, setSeverity] = useState('medium');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<'sent' | 'queued' | null>(null);

  const submit = async () => {
    setSubmitting(true);
    const { sent } = await submitOrQueueReport({
      type,
      severity,
      lat,
      lng,
      description,
      vehicle_id: vehicleId,
    });
    setSubmitting(false);
    setResult(sent ? 'sent' : 'queued');
    setTimeout(() => {
      setOpen(false);
      setResult(null);
      setDescription('');
    }, 1800);
  };

  if (result) {
    return (
      <div
        className={`flex items-center justify-center gap-2 w-full py-3 rounded-md font-semibold shadow-sm ${
          result === 'sent'
            ? 'bg-moss-100 text-moss-600 border border-moss-200'
            : 'bg-amber-50 text-amber-700 border border-amber-200'
        }`}
      >
        {result === 'sent' ? <CheckCircle2 size={18} /> : <CloudOff size={18} />}
        {result === 'sent' ? 'Report Sent' : 'Saved - will sync when online'}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center justify-center gap-2 w-full py-3 rounded-md font-semibold transition-all shadow-sm bg-white text-terracotta-600 border border-terracotta-200 hover:bg-terracotta-50"
      >
        <AlertTriangle size={18} />
        Report Blockage
      </button>
    );
  }

  return (
    <div className="w-full bg-white border border-terracotta-200 rounded-md p-3 shadow-sm space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="text-xs border border-monsoon-200 rounded-lg px-2 py-1.5 text-monsoon-800"
        >
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          className="text-xs border border-monsoon-200 rounded-lg px-2 py-1.5 text-monsoon-800 capitalize"
        >
          {['low', 'medium', 'high', 'severe'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Optional description"
        className="w-full text-xs border border-monsoon-200 rounded-lg px-2 py-1.5 text-monsoon-800"
      />
      <div className="flex gap-2">
        <button
          onClick={() => setOpen(false)}
          className="flex-1 text-xs py-2 rounded-lg border border-monsoon-200 text-monsoon-600"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={submitting}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg bg-terracotta-600 text-white font-semibold disabled:opacity-60"
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
          Submit
        </button>
      </div>
    </div>
  );
};
