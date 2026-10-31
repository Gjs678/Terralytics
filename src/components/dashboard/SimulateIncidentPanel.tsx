import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, CheckCircle2, Zap } from 'lucide-react';
import { mossamApi, type VehicleDto, type IncidentResponseDto } from '../../services/api';

const INCIDENT_TYPES = [
  { value: 'landslide', label: 'Landslide' },
  { value: 'flood', label: 'Flood' },
  { value: 'road_blockage', label: 'Road Blockage' },
  { value: 'accident', label: 'Accident' },
  { value: 'heavy_rainfall', label: 'Heavy Rainfall' },
];

const SEVERITIES = ['low', 'medium', 'high', 'severe'];

export const SimulateIncidentPanel: React.FC<{ onTriggered?: (result: IncidentResponseDto) => void }> = ({ onTriggered }) => {
  const [vehicles, setVehicles] = useState<VehicleDto[]>([]);
  const [type, setType] = useState('landslide');
  const [severity, setSeverity] = useState('severe');
  const [vehicleId, setVehicleId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IncidentResponseDto | null>(null);

  useEffect(() => {
    mossamApi
      .getFleet()
      .then((data) => {
        setVehicles(data);
        if (data.length > 0) setVehicleId(data.find((v) => v.current_route_id)?.id || data[0].id);
      })
      .catch(() => setError('Backend unavailable. Start it with: uvicorn app.main:app --reload'));
  }, []);

  const trigger = async () => {
    if (!vehicleId) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const vehicle = vehicles.find((v) => v.id === vehicleId);
      const route = vehicle ? await mossamApi.getRoutes(vehicle.id) : [];
      const point = route[0]?.coordinates?.[Math.floor((route[0]?.coordinates.length || 1) / 2)];
      const lat = point ? point[0] : vehicle?.lat ?? 26.1158;
      const lng = point ? point[1] : vehicle?.lng ?? 91.7026;

      const res = await mossamApi.createIncident(
        { type, severity, lat, lng, description: `Simulated ${severity} ${type.replace('_', ' ')} triggered from control room.` },
        vehicleId
      );
      setResult(res);
      onTriggered?.(res);
    } catch (e: any) {
      setError(e.message || 'Failed to trigger incident');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-monsoon-900 rounded-lg border border-monsoon-800 p-4 overflow-y-auto custom-scrollbar">
      <div className="flex items-center gap-2 mb-3 text-monsoon-100 font-heading font-semibold">
        <Zap size={16} className="text-amber-500" /> Simulate Incident
      </div>

      <div className="grid grid-cols-1 min-[440px]:grid-cols-3 gap-2 mb-3">
        <div>
          <label className="text-[11px] uppercase text-monsoon-500 block mb-1">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full bg-monsoon-950 border border-monsoon-800 rounded-lg px-2 py-1.5 text-sm text-monsoon-100"
          >
            {INCIDENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[11px] uppercase text-monsoon-500 block mb-1">Severity</label>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="w-full bg-monsoon-950 border border-monsoon-800 rounded-lg px-2 py-1.5 text-sm text-monsoon-100 capitalize"
          >
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[11px] uppercase text-monsoon-500 block mb-1">Affected Vehicle</label>
          <select
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            className="w-full bg-monsoon-950 border border-monsoon-800 rounded-lg px-2 py-1.5 text-sm text-monsoon-100"
          >
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>{v.id}</option>
            ))}
          </select>
        </div>
      </div>

      <button
        onClick={trigger}
        disabled={loading || !vehicleId}
        className="w-full flex items-center justify-center gap-2 bg-terracotta-600 hover:bg-terracotta-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-md transition-colors"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <AlertTriangle size={16} />}
        Trigger Incident
      </button>

      {error && <p className="text-terracotta-500 text-xs mt-2">{error}</p>}

      {result && (
        <div className="mt-3 p-3 bg-moss-900/20 border border-moss-500/30 rounded-md text-xs text-monsoon-200 space-y-1 animate-fade-in">
          <div className="flex items-center gap-1.5 text-moss-400 font-bold">
            <CheckCircle2 size={14} /> Incident {result.incident.id} persisted
          </div>
          {result.updated_route && (
            <p>Route {result.updated_route.id} risk rose to {result.updated_route.hazard_risk.toFixed(0)}/100 (score {result.updated_route.score.toFixed(1)}).</p>
          )}
          {result.alternative_route && (
            <p>Alternative {result.alternative_route.id} generated - risk {result.alternative_route.hazard_risk.toFixed(0)}/100, score {result.alternative_route.score.toFixed(1)}.</p>
          )}
          {result.decision && <p className="text-monsoon-300 italic">"{result.decision.explanation}"</p>}
          {result.alert && <p>Alert issued: {result.alert.title}</p>}
        </div>
      )}
    </div>
  );
};
