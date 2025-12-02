import { useAuth } from "@/contexts/AuthContext";

export type CompanyType = 'droneoperator' | 'flyselskap' | null;

interface Terminology {
  // Nouns (singular/plural)
  vehicle: string;
  vehicles: string;
  vehicleLower: string;
  vehiclesLower: string;
  
  // Compound words
  vehicleWeather: string;
  flightHours: string;
  
  // Actions
  addVehicle: string;
  noVehicles: string;
  selectVehicle: string;
  vehicleModel: string;
  vehicleRegistration: string;
  
  // Status related
  vehicleStatus: string;
  
  // Inspection
  lastInspection: string;
  nextInspection: string;
  
  // Labels
  assignedVehicles: string;
}

export const useTerminology = (): Terminology => {
  const { companyType } = useAuth();
  
  const isAirline = companyType === 'flyselskap';
  
  return {
    // Nouns (singular/plural)
    vehicle: isAirline ? 'Fly' : 'Drone',
    vehicles: isAirline ? 'Fly' : 'Droner',
    vehicleLower: isAirline ? 'fly' : 'drone',
    vehiclesLower: isAirline ? 'fly' : 'droner',
    
    // Compound words
    vehicleWeather: isAirline ? 'Flyvær' : 'Dronevær',
    flightHours: 'Flyvetimer',
    
    // Actions
    addVehicle: isAirline ? 'Legg til fly' : 'Legg til drone',
    noVehicles: isAirline ? 'Ingen fly registrert' : 'Ingen droner registrert',
    selectVehicle: isAirline ? 'Velg fly' : 'Velg drone',
    vehicleModel: isAirline ? 'Flymodell' : 'Dronemodell',
    vehicleRegistration: isAirline ? 'Flyregistrering' : 'Droneregistrering',
    
    // Status related
    vehicleStatus: isAirline ? 'Flystatus' : 'Dronestatus',
    
    // Inspection
    lastInspection: 'Siste inspeksjon',
    nextInspection: 'Neste inspeksjon',
    
    // Labels
    assignedVehicles: isAirline ? 'Tilknyttede fly' : 'Tilknyttede droner',
  };
};
