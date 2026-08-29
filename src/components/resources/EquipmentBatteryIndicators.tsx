import { useTranslation } from "react-i18next";
import { Heart, RefreshCw } from "lucide-react";
import { isBatteryType } from "@/config/equipmentCategories";
import { useBatteryHealth } from "@/hooks/useBatteryHealth";
import { batteryHealthLevel, cycleLevel, levelColorClass } from "@/lib/batteryHealth";

interface EquipmentBatteryIndicatorsProps {
  equipmentId: string;
  type: string | null | undefined;
  serienummer: string | null | undefined;
  internalSerial?: string | null;
  companyId: string | null | undefined;
}

/**
 * Compact health (%) and cycle indicator shown on battery cards on the
 * resources page. Uses the same shared battery-health source and color logic
 * as the equipment detail dialog and the logbook battery tab.
 */
export const EquipmentBatteryIndicators = ({
  equipmentId,
  type,
  serienummer,
  internalSerial,
  companyId,
}: EquipmentBatteryIndicatorsProps) => {
  const { t } = useTranslation();
  const isBattery = isBatteryType(type);
  const batteryHealth = useBatteryHealth(
    equipmentId,
    serienummer || internalSerial,
    companyId,
    isBattery,
  );

  if (!isBattery) return null;

  const latest = batteryHealth.trend[batteryHealth.trend.length - 1];
  const healthValue = batteryHealth.latestHealth;
  const cycles = latest?.cycles ?? null;

  if (healthValue == null && cycles == null) return null;

  return (
    <div className="mt-2 flex items-center gap-3 text-xs border-t border-border/60 pt-2">
      {healthValue != null && (
        <span
          className={`flex items-center gap-1 font-semibold ${levelColorClass(
            batteryHealthLevel(healthValue, batteryHealth.config),
          )}`}
          title={batteryHealth.config.typeName ?? undefined}
        >
          <Heart className="w-3 h-3" />
          {t("resourceDialogs.equipmentLogbook.battery.health")}: {healthValue}%
        </span>
      )}
      {cycles != null && (
        <span
          className={`flex items-center gap-1 font-semibold ${levelColorClass(
            cycleLevel(cycles, batteryHealth.config),
          )}`}
        >
          <RefreshCw className="w-3 h-3" />
          {t("resourceDialogs.equipmentLogbook.battery.cycles")}: {cycles}
          {batteryHealth.config.maxCycles ? (
            <span className="font-normal text-muted-foreground">
              /{batteryHealth.config.maxCycles}
            </span>
          ) : null}
        </span>
      )}
    </div>
  );
};
