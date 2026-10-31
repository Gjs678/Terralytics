export type VehicleStatus = 'in-transit' | 'rerouted' | 'delayed' | 'offline';

export interface Vehicle {
  id: string;
  driverName: string;
  status: VehicleStatus;
  currentLocation: [number, number]; // [lat, lng]
  lastKnownLocationName: string;
  destination: string;
  eta: string;
  connectivity: 'online' | 'offline-sms' | 'no-signal';
  currentRouteId?: string;
}

export const MOCK_FLEET: Vehicle[] = [
  {
    id: 'TRK-9012',
    driverName: 'Ranjan Das',
    status: 'in-transit',
    currentLocation: [26.1158, 91.7026], // Guwahati
    lastKnownLocationName: 'Guwahati NH-27',
    destination: 'Shillong',
    eta: '2 hrs 15 mins',
    connectivity: 'online',
    currentRouteId: 'RT-001'
  },
  {
    id: 'TRK-8845',
    driverName: 'Amit Boro',
    status: 'rerouted',
    currentLocation: [27.0844, 93.6053], // Itanagar
    lastKnownLocationName: 'Itanagar Approach',
    destination: 'Ziro',
    eta: '4 hrs',
    connectivity: 'online',
    currentRouteId: 'RT-002'
  },
  {
    id: 'TRK-7721',
    driverName: 'Tenzing Norgay',
    status: 'offline',
    currentLocation: [27.586, 91.869], // Tawang area
    lastKnownLocationName: 'Sela Pass',
    destination: 'Tawang',
    eta: 'Unknown',
    connectivity: 'offline-sms',
    currentRouteId: 'RT-003'
  },
  {
    id: 'TRK-5534',
    driverName: 'Debajit Saikia',
    status: 'delayed',
    currentLocation: [24.8333, 92.7789], // Silchar
    lastKnownLocationName: 'Silchar bypass',
    destination: 'Aizawl',
    eta: '+5 hrs',
    connectivity: 'no-signal',
    currentRouteId: 'RT-004'
  },
  {
    id: 'TRK-1122',
    driverName: 'Lalrinfela',
    status: 'in-transit',
    currentLocation: [23.7271, 92.7176], // Aizawl
    lastKnownLocationName: 'Aizawl City',
    destination: 'Champhai',
    eta: '6 hrs',
    connectivity: 'online'
  }
];
