export interface RoutePoint {
  lat: number;
  lng: number;
}

export interface RouteData {
  coordinates: RoutePoint[];
  totalDistance: number;
  areaKm2?: number;
  pilotPosition?: RoutePoint;
  maxDistanceFromPilot?: number;
  pointsOutsideVLOS?: number;
  soraSettings?: SoraSettings;
}

export interface SoraSettings {
  enabled: boolean;
  flightAltitude: number;
  flightGeographyDistance: number;
  contingencyDistance: number;
  contingencyHeight: number;
  groundRiskDistance: number;
  bufferMode?: "corridor" | "convexHull";
}
