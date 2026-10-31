export interface ImpactStats {
  onTimeDeliveryPercent: number;
  corridorsAvoided: number;
  fuelSavedLiters: number;
  co2SavedKg: number;
  villagesReached: number;
}

export const MOCK_IMPACT_STATS: ImpactStats = {
  onTimeDeliveryPercent: 94.2,
  corridorsAvoided: 17,
  fuelSavedLiters: 4250,
  co2SavedKg: 11390,
  villagesReached: 342
};

export const MOCK_TREND_DATA = [
  { date: 'Aug 01', incidents: 2, reroutes: 2 },
  { date: 'Aug 05', incidents: 5, reroutes: 4 },
  { date: 'Aug 10', incidents: 8, reroutes: 7 },
  { date: 'Aug 15', incidents: 12, reroutes: 11 },
  { date: 'Aug 20', incidents: 4, reroutes: 3 },
  { date: 'Aug 25', incidents: 7, reroutes: 7 },
  { date: 'Aug 30', incidents: 9, reroutes: 9 },
];
