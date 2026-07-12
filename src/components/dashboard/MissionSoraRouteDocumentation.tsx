import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import {
  OUTDOOR_ASSEMBLIES_LABELS,
  POPULATION_DENSITY_LABELS,
  UA_SIZE_LABELS,
} from "@/lib/adjacentAreaCalculator";

interface MissionSoraRouteDocumentationProps {
  route: any;
  compact?: boolean;
  className?: string;
}

const fmt = (value: unknown, decimals = 0, unit = "") => {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "-";
  return `${n.toLocaleString("nb-NO", { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}${unit}`;
};

const fmtDate = (value: unknown) => {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("nb-NO", { dateStyle: "short", timeStyle: "short" });
};

export const hasSoraRouteDocumentation = (route: any) =>
  !!route?.soraSettings?.enabled || !!route?.adjacentAreaDocumentation?.enabled;

export const MissionSoraRouteDocumentation = ({ route, compact = false, className }: MissionSoraRouteDocumentationProps) => {
  const { t } = useTranslation();
  const sora = route?.soraSettings;
  const adjacent = route?.adjacentAreaDocumentation;

  if (!hasSoraRouteDocumentation(route)) return null;

  const rows: Array<{ section?: string; label: string; value: string }> = [];

  if (sora?.enabled) {
    rows.push(
      { section: t("sora.routeDocumentation.sectionSora"), label: t("sora.routeDocumentation.flightGeography"), value: fmt(sora.flightGeographyDistance, 0, " m") },
      { label: t("sora.routeDocumentation.contingencyBuffer"), value: fmt(sora.contingencyDistance, 0, " m") },
      { label: t("sora.routeDocumentation.contingencyHeight"), value: fmt(sora.contingencyHeight, 0, " m") },
      { label: t("sora.routeDocumentation.groundRiskBuffer"), value: fmt(sora.groundRiskDistance, 0, " m") },
      { label: t("sora.routeDocumentation.flightAltitude"), value: fmt(sora.flightAltitude, 0, " m AGL") },
      { label: t("sora.routeDocumentation.bufferMode"), value: sora.bufferMode === "convexHull" ? t("sora.routeDocumentation.bufferModeConvex") : t("sora.routeDocumentation.bufferModeCorridor") },
      { label: t("sora.routeDocumentation.drone"), value: sora.droneName || (sora.droneId ? t("sora.routeDocumentation.droneSelectedInPlanner") : t("sora.routeDocumentation.droneNotSelected")) },
      { label: t("sora.routeDocumentation.cd"), value: fmt(sora.characteristicDimensionM, 2, " m") },
      { label: t("sora.routeDocumentation.v0"), value: fmt(sora.groundSpeedMps, 1, " m/s") },
    );
  }

  if (adjacent?.enabled) {
    rows.push(
      { section: t("sora.routeDocumentation.sectionAdjacent"), label: t("sora.routeDocumentation.adjacentRadius"), value: fmt((adjacent.adjacentRadiusM ?? 0) / 1000, 1, " km") },
      { label: t("sora.routeDocumentation.area"), value: fmt(adjacent.adjacentAreaKm2, 1, " km²") },
      { label: t("sora.routeDocumentation.populationFound"), value: fmt(adjacent.totalPopulation, 0) },
      { label: t("sora.routeDocumentation.avgDensity"), value: fmt(adjacent.avgDensity, 1, " pers/km²") },
      { label: t("sora.routeDocumentation.dataSource"), value: adjacent.dataSource || (adjacent.gridResolutionM ? `SSB ${adjacent.gridResolutionM} m` : t("sora.routeDocumentation.dataSourceDefault")) },
      { label: t("sora.routeDocumentation.calculation"), value: adjacent.calculation || adjacent.method || "-" },
      { label: t("sora.routeDocumentation.densityCategory"), value: POPULATION_DENSITY_LABELS[adjacent.populationDensityCategory as keyof typeof POPULATION_DENSITY_LABELS] ?? adjacent.populationDensityCategory ?? "-" },
      { label: t("sora.routeDocumentation.uaSize"), value: UA_SIZE_LABELS[adjacent.uaSize as keyof typeof UA_SIZE_LABELS] ?? adjacent.uaSize ?? "-" },
      { label: t("sora.routeDocumentation.sail"), value: adjacent.sail ? `SAIL ${adjacent.sail}` : "-" },
      { label: t("sora.routeDocumentation.outdoorAssemblies"), value: OUTDOOR_ASSEMBLIES_LABELS[adjacent.outdoorAssemblies as keyof typeof OUTDOOR_ASSEMBLIES_LABELS] ?? adjacent.outdoorAssemblies ?? "-" },
      { label: t("sora.routeDocumentation.requiredContainment"), value: adjacent.requiredContainment ?? "-" },
      { label: t("sora.routeDocumentation.result"), value: adjacent.statusText || (adjacent.pass ? t("sora.routeDocumentation.resultPass") : t("sora.routeDocumentation.resultFail")) },
      { label: t("sora.routeDocumentation.calculatedAt"), value: fmtDate(adjacent.calculatedAt) },
    );
  }

  return (
    <Collapsible className={cn("border-t border-border pt-2", className)}>
      <CollapsibleTrigger
        className={cn(
          "group flex w-full items-center justify-between gap-2 text-left text-muted-foreground hover:text-foreground",
          compact ? "text-[11px]" : "text-sm font-medium",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <span>{t("sora.routeDocumentation.collapseTitle")}</span>
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent onClick={(e) => e.stopPropagation()}>
        <div className={cn("grid gap-x-3 gap-y-1 pt-2", compact ? "grid-cols-[minmax(0,1fr)_auto] text-[11px]" : "grid-cols-[minmax(0,220px)_1fr] text-sm")}>
          {rows.map((row, index) => (
            <div key={`${row.label}-${index}`} className="contents">
              {row.section && <div className="col-span-2 pt-2 first:pt-0 text-xs font-semibold text-foreground">{row.section}</div>}
              <div className="text-muted-foreground">{row.label}</div>
              <div className="font-medium text-foreground text-right sm:text-left">{row.value}</div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};