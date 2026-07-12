import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useTranslation } from "react-i18next";
import {
  Clock, Zap, Battery, MapPin, Route, Mountain, Satellite,
  Thermometer, Ruler, AlertTriangle, Info, LogIn, LogOut, Plane,
  ChevronDown,
} from "lucide-react";

export interface FlightSummary {
  durationMinutes?: number | null;
  maxSpeedMs?: number | null;
  minBatteryPct?: number | null;
  minBatteryV?: number | null;
  totalRows?: number | null;
  totalDistanceM?: number | null;
  maxAltitudeM?: number | null;
  minGpsSat?: number | null;
  maxGpsSat?: number | null;
  batteryTempMaxC?: number | null;
  batteryTempMinC?: number | null;
  batteryVoltageMinV?: number | null;
  maxDistanceM?: number | null;
  maxVSpeedMs?: number | null;
  batteryCellDeviationV?: number | null;
  rthTriggered?: boolean | null;
  source?: string | null;
}

interface FlightSummaryPanelProps {
  summary: FlightSummary;
  events?: any[];
}

const formatDistance = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;

export const FlightSummaryPanel = ({ summary, events = [] }: FlightSummaryPanelProps) => {
  const { t } = useTranslation();
  const s = summary;
  const isArdu = s.source === "ardupilot";

  const showBatteryAsVoltage = isArdu && (s.minBatteryPct == null || s.minBatteryPct <= 0);
  const batteryDisplay = showBatteryAsVoltage
    ? (s.minBatteryV != null ? `${s.minBatteryV} V` : null)
    : (s.minBatteryPct != null && s.minBatteryPct >= 0 ? `${s.minBatteryPct}%` : null);
  const batteryWarn = !showBatteryAsVoltage && s.minBatteryPct != null && s.minBatteryPct >= 0 && s.minBatteryPct < 20;

  const primary: Array<{ icon: any; label: string; value: string | null; warn?: boolean }> = [
    { icon: Clock, label: t('dashboard.flightAnalysis.labels.flightTime'), value: s.durationMinutes != null ? `${s.durationMinutes} min` : null },
    { icon: Zap, label: t('dashboard.flightAnalysis.labels.maxSpeed'), value: s.maxSpeedMs != null ? `${s.maxSpeedMs} m/s` : null },
    { icon: Battery, label: t('dashboard.flightAnalysis.labels.minBattery'), value: batteryDisplay, warn: batteryWarn },
    { icon: MapPin, label: t('dashboard.flightAnalysis.labels.dataPoints'), value: s.totalRows != null ? `${s.totalRows}` : null },
  ];

  const extended: Array<{ icon: any; label: string; value: string | null; warn?: boolean }> = [
    { icon: Route, label: t('dashboard.flightAnalysis.labels.distance'), value: s.totalDistanceM != null ? formatDistance(s.totalDistanceM) : null },
    { icon: Mountain, label: t('dashboard.flightAnalysis.labels.maxAltitude'), value: s.maxAltitudeM != null ? `${s.maxAltitudeM} m` : null },
    {
      icon: Satellite,
      label: t('dashboard.flightAnalysis.labels.gpsSat'),
      value: s.minGpsSat != null
        ? `${s.minGpsSat}${s.maxGpsSat != null ? ` – ${s.maxGpsSat}` : ""}`
        : null,
      warn: s.minGpsSat != null && s.minGpsSat < 6,
    },
    {
      icon: Thermometer,
      label: t('dashboard.flightAnalysis.labels.batteryTemp'),
      value: s.batteryTempMaxC != null
        ? `${s.batteryTempMinC != null ? `${s.batteryTempMinC} – ` : ""}${s.batteryTempMaxC}°C`
        : null,
      warn: (s.batteryTempMaxC != null && s.batteryTempMaxC > 50) || (s.batteryTempMinC != null && s.batteryTempMinC < 5),
    },
    { icon: Zap, label: t('dashboard.flightAnalysis.labels.minVoltage'), value: s.batteryVoltageMinV != null ? `${s.batteryVoltageMinV} V` : null },
    { icon: Ruler, label: t('dashboard.flightAnalysis.labels.maxDistance'), value: s.maxDistanceM != null ? formatDistance(s.maxDistanceM) : null },
    { icon: Mountain, label: t('dashboard.flightAnalysis.labels.maxVSpeed'), value: s.maxVSpeedMs != null ? `${s.maxVSpeedMs} m/s` : null },
    {
      icon: Zap,
      label: t('dashboard.flightAnalysis.labels.cellDeviation'),
      value: s.batteryCellDeviationV != null ? `${s.batteryCellDeviationV.toFixed(3)} V` : null,
      warn: s.batteryCellDeviationV != null && s.batteryCellDeviationV > 0.1,
    },
  ];

  const primaryShown = primary.filter(p => p.value != null);
  const extendedShown = extended.filter(p => p.value != null);

  // Group events
  const eventMap = new Map<string, { ev: any; count: number }>();
  events.forEach((e: any) => {
    const key = `${e.type}:${e.message}`;
    const existing = eventMap.get(key);
    if (existing) existing.count++;
    else eventMap.set(key, { ev: e, count: 1 });
  });
  const grouped = [...eventMap.values()];
  const mainEvents = grouped.filter(g => !["APP_WARNING", "message"].includes(g.ev.type));
  const appWarningEvents = grouped.filter(g => g.ev.type === "APP_WARNING" || g.ev.type === "message");

  const hasAnything =
    primaryShown.length > 0 || extendedShown.length > 0 || s.rthTriggered || events.length > 0;

  if (!hasAnything) return null;

  return (
    <div className="space-y-2">
      {primaryShown.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {primaryShown.map((p, i) => {
            const Icon = p.icon;
            return (
              <div key={i} className="p-2 rounded-lg bg-muted/50 space-y-0.5">
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Icon className="w-3 h-3" />{p.label}
                </div>
                <p className={`text-sm font-semibold ${p.warn ? "text-destructive" : ""}`}>{p.value}</p>
              </div>
            );
          })}
        </div>
      )}

      {extendedShown.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {extendedShown.map((p, i) => {
            const Icon = p.icon;
            return (
              <div key={i} className="p-2 rounded-lg bg-muted/30 space-y-0.5">
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Icon className="w-3 h-3" />{p.label}
                </div>
                <p className={`text-sm font-medium ${p.warn ? "text-destructive" : ""}`}>{p.value}</p>
              </div>
            );
          })}
        </div>
      )}

      {s.rthTriggered && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/30">
          <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-sm font-medium text-destructive">
            {t('dashboard.flightAnalysis.rthTriggered')}
          </p>
        </div>
      )}

      {(mainEvents.length > 0 || appWarningEvents.length > 0) && (
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-muted/40 transition-colors">
            <p className="text-xs font-medium text-muted-foreground">
              {t('dashboard.flightAnalysis.flightEvents', { count: mainEvents.reduce((s, g) => s + g.count, 0) + appWarningEvents.reduce((s, g) => s + g.count, 0) })}
            </p>
            <ChevronDown className="w-3.5 h-3.5 ml-auto text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-1.5 mt-1.5">
            {mainEvents.map(({ ev, count }, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/40 text-xs">
                {ev.type === "RTH" && <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />}
                {ev.type === "LOW_BATTERY" && <Battery className="w-3 h-3 text-destructive shrink-0" />}
                {(ev.type === "error" || ev.type === "failsafe") && <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />}
                {ev.type === "arm" && <LogIn className="w-3 h-3 text-green-600 dark:text-green-400 shrink-0" />}
                {ev.type === "disarm" && <LogOut className="w-3 h-3 text-muted-foreground shrink-0" />}
                {ev.type === "mode_change" && <Plane className="w-3 h-3 text-primary shrink-0" />}
                {!["RTH", "LOW_BATTERY", "error", "failsafe", "arm", "disarm", "mode_change"].includes(ev.type) && (
                  <Info className="w-3 h-3 text-muted-foreground shrink-0" />
                )}
                <span className="font-medium">{ev.type}</span>
                {ev.message && <span className="text-muted-foreground break-words whitespace-normal">{ev.message}</span>}
                {count > 1 && <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 shrink-0">×{count}</Badge>}
              </div>
            ))}
            {appWarningEvents.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full py-1">
                  <Info className="w-3 h-3 shrink-0" />
                  <span>{t('dashboard.flightAnalysis.appWarnings', { count: appWarningEvents.reduce((s, g) => s + g.count, 0) })}</span>
                  <ChevronDown className="w-3 h-3 ml-auto transition-transform [[data-state=open]>&]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-1 mt-1">
                  {appWarningEvents.map(({ ev, count }, i) => (
                    <div key={i} className="flex items-start gap-2 px-2 py-1.5 rounded bg-muted/30 text-xs">
                      <Info className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
                      <span className="text-muted-foreground break-words whitespace-normal flex-1">{ev.message}</span>
                      {count > 1 && <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 shrink-0">×{count}</Badge>}
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
};
