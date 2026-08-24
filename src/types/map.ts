export interface RoutePoint {
  lat: number;
  lng: number;
}

/** En enkeltstående rute i et oppdrag. Et oppdrag kan ha flere separate ruter. */
export interface RouteSegment {
  id: string;
  name?: string;
  coordinates: RoutePoint[];
  totalDistance: number;
  areaKm2?: number;
}

export interface RouteData {
  /** Speiler koordinatene til den aktive ruten (bakoverkompatibelt felt). */
  coordinates: RoutePoint[];
  totalDistance: number;
  areaKm2?: number;
  /** Alle ruter i oppdraget. Mangler på eldre lagrede ruter (= én rute). */
  routes?: RouteSegment[];
  /** Id-en til ruten som er valgt/aktiv. */
  activeRouteId?: string;
  pilotPosition?: RoutePoint;
  maxDistanceFromPilot?: number;
  pointsOutsideVLOS?: number;
  soraSettings?: SoraSettings;
  adjacentAreaDocumentation?: AdjacentAreaDocumentation;
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
  dataSource?: string;
  method?: string;
  calculation?: string;
  driver?: string;
  maxCellPopulation?: number;
  gridResolutionM?: number;
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
  droneName?: string;
  characteristicDimensionM?: number;
  groundSpeedMps?: number;
}
