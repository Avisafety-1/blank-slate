// Deno-port of src/lib/maintenanceStatus.ts. Holdt i synk manuelt — hvis
// statuslogikken endres i UI-et må denne filen oppdateres tilsvarende.
// Brukes for å beregne ekte aggregert dronestatus for AI-risikovurderingen,
// slik at AI ikke får utdatert "Grønn" fra drones.status-kolonnen når en
// inspeksjonsdato er forfalt eller intervalltimer/oppdrag er overskredet.

export type Status = "Grønn" | "Gul" | "Rød";

export const STATUS_PRIORITY: Record<Status, number> = {
  "Rød": 2,
  "Gul": 1,
  "Grønn": 0,
};

export const worstStatus = (a: Status, b: Status): Status =>
  STATUS_PRIORITY[a] >= STATUS_PRIORITY[b] ? a : b;

export const calculateMaintenanceStatus = (
  nextDate: Date | string | null | undefined,
  warningDays = 14,
): Status => {
  if (!nextDate) return "Grønn";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const next = new Date(nextDate);
  next.setHours(0, 0, 0, 0);
  const daysUntil = Math.floor((next.getTime() - today.getTime()) / 86400000);
  if (daysUntil < 0) return "Rød";
  if (daysUntil <= warningDays) return "Gul";
  return "Grønn";
};

export const calculateUsageStatus = (
  current: number,
  limit: number | null | undefined,
  warningMargin?: number | null,
): Status => {
  if (!limit || limit <= 0) return "Grønn";
  if (current >= limit) return "Rød";
  const threshold = (warningMargin != null && warningMargin > 0)
    ? limit - warningMargin
    : limit * 0.8;
  if (current >= threshold) return "Gul";
  return "Grønn";
};

export const calculateDroneInspectionStatus = (p: {
  neste_inspeksjon?: string | null;
  varsel_dager?: number | null;
  flyvetimer: number;
  hours_at_last_inspection: number;
  inspection_interval_hours?: number | null;
  varsel_timer?: number | null;
  missions_since_inspection: number;
  inspection_interval_missions?: number | null;
  varsel_oppdrag?: number | null;
}): Status => {
  const dateS = calculateMaintenanceStatus(p.neste_inspeksjon, p.varsel_dager ?? 14);
  const hoursS = calculateUsageStatus(
    (p.flyvetimer ?? 0) - (p.hours_at_last_inspection ?? 0),
    p.inspection_interval_hours,
    p.varsel_timer,
  );
  const missionsS = calculateUsageStatus(
    p.missions_since_inspection ?? 0,
    p.inspection_interval_missions,
    p.varsel_oppdrag,
  );
  return [dateS, hoursS, missionsS].reduce(
    (w, s) => worstStatus(w, s),
    "Grønn" as Status,
  );
};

export const calculateEquipmentMaintenanceStatus = (p: {
  neste_vedlikehold?: string | null;
  varsel_dager?: number | null;
  flyvetimer: number;
  hours_at_last_maintenance: number;
  inspection_interval_hours?: number | null;
  varsel_timer?: number | null;
  missions_since_maintenance: number;
  inspection_interval_missions?: number | null;
  varsel_oppdrag?: number | null;
}): Status => {
  const dateS = calculateMaintenanceStatus(p.neste_vedlikehold, p.varsel_dager ?? 14);
  const hoursS = calculateUsageStatus(
    (p.flyvetimer ?? 0) - (p.hours_at_last_maintenance ?? 0),
    p.inspection_interval_hours,
    p.varsel_timer,
  );
  const missionsS = calculateUsageStatus(
    p.missions_since_maintenance ?? 0,
    p.inspection_interval_missions,
    p.varsel_oppdrag,
  );
  return [dateS, hoursS, missionsS].reduce(
    (w, s) => worstStatus(w, s),
    "Grønn" as Status,
  );
};

export interface DroneAggregateInput {
  neste_inspeksjon?: string | null;
  varsel_dager?: number | null;
  flyvetimer?: number | null;
  hours_at_last_inspection?: number | null;
  inspection_interval_hours?: number | null;
  varsel_timer?: number | null;
  missions_since_inspection?: number | null;
  inspection_interval_missions?: number | null;
  varsel_oppdrag?: number | null;
}

export interface MaintenanceItem {
  navn?: string | null;
  neste_vedlikehold?: string | null;
  varsel_dager?: number | null;
}

export const calculateDroneAggregatedStatus = (
  drone: DroneAggregateInput,
  accessories: MaintenanceItem[],
  linkedEquipment: MaintenanceItem[],
): { status: Status; affectedItems: string[]; reasons: string[] } => {
  const reasons: string[] = [];
  const affectedItems: string[] = [];

  const dateS = calculateMaintenanceStatus(drone.neste_inspeksjon, drone.varsel_dager ?? 14);
  if (dateS !== "Grønn") reasons.push(`Inspeksjonsdato (${drone.neste_inspeksjon}) → ${dateS}`);

  const hoursDelta = (drone.flyvetimer ?? 0) - (drone.hours_at_last_inspection ?? 0);
  const hoursS = calculateUsageStatus(hoursDelta, drone.inspection_interval_hours, drone.varsel_timer);
  if (hoursS !== "Grønn") reasons.push(`Timer siden inspeksjon (${hoursDelta.toFixed(1)}/${drone.inspection_interval_hours}) → ${hoursS}`);

  const missionsS = calculateUsageStatus(
    drone.missions_since_inspection ?? 0,
    drone.inspection_interval_missions,
    drone.varsel_oppdrag,
  );
  if (missionsS !== "Grønn") reasons.push(`Oppdrag siden inspeksjon (${drone.missions_since_inspection}/${drone.inspection_interval_missions}) → ${missionsS}`);

  let worst = [dateS, hoursS, missionsS].reduce((w, s) => worstStatus(w, s), "Grønn" as Status);

  for (const acc of accessories || []) {
    const s = calculateMaintenanceStatus(acc.neste_vedlikehold, acc.varsel_dager ?? 14);
    if (s !== "Grønn") {
      affectedItems.push(acc.navn || "Tilbehør");
      reasons.push(`Tilbehør ${acc.navn ?? ""} → ${s}`);
    }
    worst = worstStatus(worst, s);
  }
  for (const eq of linkedEquipment || []) {
    const s = calculateMaintenanceStatus(eq.neste_vedlikehold, eq.varsel_dager ?? 14);
    if (s !== "Grønn") {
      affectedItems.push(eq.navn || "Utstyr");
      reasons.push(`Koblet utstyr ${eq.navn ?? ""} → ${s}`);
    }
    worst = worstStatus(worst, s);
  }

  return { status: worst, affectedItems, reasons };
};
