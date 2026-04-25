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
  adjacentAreaDocumentation?: AdjacentAreaDocumentation;
  _createSoraDocumentation?: boolean;
}

export interface AdjacentAreaDocumentation {
  enabled: boolean;
  calculatedAt: string;
  adjacentRadiusM: number;
  adjacentAreaKm2: number;
  totalPopulation: number;
  avgDensity: number;
  threshold: number;
  pass: boolean;
  uaSize: string;
  sail: string;
  populationDensityCategory: string;
  outdoorAssemblies: string;
  requiredContainment: string;
  containmentLevel: string;
  statusText: string;
}

export interface SoraSettings {
  enabled: boolean;
  flightAltitude: number;
  flightGeographyDistance: number;
  contingencyDistance: number;
  contingencyHeight: number;
  groundRiskDistance: number;
  bufferMode?: "corridor" | "convexHull";
  droneId?: string;
  characteristicDimensionM?: number;
  groundSpeedMps?: number;
}
