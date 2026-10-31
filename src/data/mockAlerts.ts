export type AlertSeverity = 'critical' | 'high' | 'medium' | 'info';

export interface AlertEvent {
  id: string;
  timestamp: string; // ISO or readable
  title: string;
  description: string;
  severity: AlertSeverity;
  vehicleId?: string;
  location?: [number, number];
}

export const MOCK_ALERTS: AlertEvent[] = [
  {
    id: 'AL-101',
    timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    title: 'Blockage Predicted',
    description: 'High probability of landslide on NH-13 near Along due to continuous 6hr rainfall.',
    severity: 'critical',
    location: [28.1722, 94.7956]
  },
  {
    id: 'AL-102',
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    title: 'Reroute Issued',
    description: 'Vehicle TRK-8845 rerouted via alternate district road to avoid flooded zone.',
    severity: 'high',
    vehicleId: 'TRK-8845'
  },
  {
    id: 'AL-103',
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    title: 'Vehicle Offline',
    description: 'Vehicle TRK-7721 lost data connection at Sela Pass. Falling back to SMS polling.',
    severity: 'medium',
    vehicleId: 'TRK-7721'
  },
  {
    id: 'AL-104',
    timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    title: 'Weather Warning',
    description: 'IMD reports intense spell of rain expected in East Khasi Hills over the next 12 hours.',
    severity: 'info'
  },
  {
    id: 'AL-105',
    timestamp: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    title: 'Vehicle Back Online',
    description: 'Vehicle TRK-5534 re-established connection near Silchar.',
    severity: 'info',
    vehicleId: 'TRK-5534'
  }
];
