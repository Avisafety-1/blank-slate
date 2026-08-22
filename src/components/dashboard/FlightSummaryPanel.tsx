import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { useRoleCheck } from "@/hooks/useRoleCheck";
import { ReassignFlightLogDialog } from "./ReassignFlightLogDialog";
import {
  Clock, Zap, Battery, MapPin, Route, Mountain, Satellite,
  Thermometer, Ruler, AlertTriangle, Info, LogIn, LogOut, Plane,
  Activity, Wind, Gauge, Repeat, Copy, Check, Cpu, FileText,
  User, Target, Pencil,
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
  // Derived
  avgSpeedMs?: number | null;
  maxWindMs?: number | null;
  maxMslM?: number | null;
  modeChanges?: number | null;
  warningCount?: number | null;
  // Identifiers / log metadata
  droneModel?: string | null;
  aircraftName?: string | null;
  aircraftSerial?: string | null;
  fcSerial?: string | null;
  rcSerial?: string | null;
  cameraSerial?: string | null;
  gimbalSerial?: string | null;
  batterySn?: string | null;
  batteryCycles?: number | null;
  batteryHealthPct?: number | null;
  batteryFullCapacityMah?: number | null;
  entrySource?: string | null;
  startTimeUtc?: string | null;
  endTimeUtc?: string | null;
  sha256?: string | null;
  logGuid?: string | null;
  // "Logged on" context
  flightLogId?: string | null;
  companyId?: string | null;
  droneId?: string | null;
  droneName?: string | null;
  droneModelName?: string | null;
  pilotProfileId?: string | null;
  pilotName?: string | null;
  missionId?: string | null;
  missionName?: string | null;
  // Traceability
  droneTotalHours?: number | null;
  pilotTotalHours?: number | null;
  inDroneLogbook?: boolean;
  inPilotLogbook?: boolean;
  droneLogEntryCount?: number | null;
  personnelLogEntryCount?: number | null;
}

interface FlightSummaryPanelProps {
  summary: FlightSummary;
  events?: any[];
  onReassigned?: () => void;
}

const CopyableValue = ({ value, truncate }: { value: string; truncate?: boolean }) => {
  const [copied, setCopied] = useState(false);
  const shown = truncate && value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
  return (
    <button
      type="button"
      className="flex items-center gap-1 text-left font-mono text-xs break-all hover:text-primary transition-colors"
      onClick={() => {
        navigator.clipboard?.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      title={value}
    >
      <span>{shown}</span>
      {copied ? <Check className="w-3 h-3 shrink-0 text-green-600 dark:text-green-400" /> : <Copy className="w-3 h-3 shrink-0 opacity-50" />}
    </button>
  );
};


const formatDistance = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;

export const FlightSummaryPanel = ({ summary, events = [], onReassigned }: FlightSummaryPanelProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isAdmin } = useRoleCheck();
  const [reassignOpen, setReassignOpen] = useState(false);
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
    { icon: Gauge, label: t('dashboard.flightAnalysis.labels.avgSpeed'), value: s.avgSpeedMs != null ? `${s.avgSpeedMs} m/s` : null },
    {
      icon: Wind,
      label: t('dashboard.flightAnalysis.labels.maxWind'),
      value: s.maxWindMs != null ? `${s.maxWindMs} m/s` : null,
      warn: s.maxWindMs != null && s.maxWindMs > 10,
    },
    { icon: Mountain, label: t('dashboard.flightAnalysis.labels.maxMsl'), value: s.maxMslM != null ? `${s.maxMslM} m` : null },
    { icon: Repeat, label: t('dashboard.flightAnalysis.labels.modeChanges'), value: s.modeChanges != null && s.modeChanges > 0 ? `${s.modeChanges}` : null },
    {
      icon: AlertTriangle,
      label: t('dashboard.flightAnalysis.labels.warningCount'),
      value: s.warningCount != null && s.warningCount > 0 ? `${s.warningCount}` : null,
      warn: true,
    },
  ];

  const detailGroups: Array<{ icon: any; title: string; rows: Array<{ label: string; value: string | null; mono?: boolean; truncate?: boolean }> }> = [
    {
      icon: Plane,
      title: t('dashboard.flightAnalysis.logDetails.drone'),
      rows: [
        { label: t('dashboard.flightAnalysis.logDetails.model'), value: s.droneModel ?? null },
        { label: t('dashboard.flightAnalysis.logDetails.aircraftName'), value: s.aircraftName ?? null },
        { label: t('dashboard.flightAnalysis.logDetails.aircraftSerial'), value: s.aircraftSerial ?? null, mono: true },
      ],
    },
    {
      icon: Cpu,
      title: t('dashboard.flightAnalysis.logDetails.hardware'),
      rows: [
        { label: t('dashboard.flightAnalysis.logDetails.fcSerial'), value: s.fcSerial ?? null, mono: true },
        { label: t('dashboard.flightAnalysis.logDetails.rcSerial'), value: s.rcSerial ?? null, mono: true },
        { label: t('dashboard.flightAnalysis.logDetails.cameraSerial'), value: s.cameraSerial ?? null, mono: true },
        { label: t('dashboard.flightAnalysis.logDetails.gimbalSerial'), value: s.gimbalSerial ?? null, mono: true },
      ],
    },
    {
      icon: Battery,
      title: t('dashboard.flightAnalysis.logDetails.battery'),
      rows: [
        { label: t('dashboard.flightAnalysis.logDetails.batterySn'), value: s.batterySn ?? null, mono: true },
        { label: t('dashboard.flightAnalysis.logDetails.batteryCycles'), value: s.batteryCycles != null ? `${s.batteryCycles}` : null },
        { label: t('dashboard.flightAnalysis.logDetails.batteryHealth'), value: s.batteryHealthPct != null ? `${s.batteryHealthPct}%` : null },
        { label: t('dashboard.flightAnalysis.logDetails.batteryCapacity'), value: s.batteryFullCapacityMah != null ? `${s.batteryFullCapacityMah} mAh` : null },
      ],
    },
    {
      icon: FileText,
      title: t('dashboard.flightAnalysis.logDetails.log'),
      rows: [
        { label: t('dashboard.flightAnalysis.logDetails.entrySource'), value: s.entrySource ?? s.source ?? null },
        { label: t('dashboard.flightAnalysis.logDetails.startTime'), value: s.startTimeUtc ? new Date(s.startTimeUtc).toISOString().replace('T', ' ').slice(0, 19) : null },
        { label: t('dashboard.flightAnalysis.logDetails.endTime'), value: s.endTimeUtc ? new Date(s.endTimeUtc).toISOString().replace('T', ' ').slice(0, 19) : null },
        { label: t('dashboard.flightAnalysis.logDetails.sha256'), value: s.sha256 ?? null, mono: true, truncate: true },
        { label: t('dashboard.flightAnalysis.logDetails.guid'), value: s.logGuid ?? null, mono: true, truncate: true },
      ],
    },
  ];

  const detailGroupsShown = detailGroups
    .map(g => ({ ...g, rows: g.rows.filter(r => r.value != null && r.value !== "") }))
    .filter(g => g.rows.length > 0);

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

  const canReassign = !!s.flightLogId && (isAdmin || (!!user?.id && s.pilotProfileId === user.id));
  const showLoggedOn = !!s.flightLogId;

  const hasAnything =
    primaryShown.length > 0 || extendedShown.length > 0 || s.rthTriggered || events.length > 0 ||
    detailGroupsShown.length > 0 || showLoggedOn;

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

      {s.flightLogId && (
        <ReassignFlightLogDialog
          open={reassignOpen}
          onOpenChange={setReassignOpen}
          flightLogId={s.flightLogId}
          companyId={s.companyId}
          currentDroneId={s.droneId}
          currentPilotId={s.pilotProfileId}
          onReassigned={() => onReassigned?.()}
        />
      )}

      {(showLoggedOn || detailGroupsShown.length > 0 || mainEvents.length > 0 || appWarningEvents.length > 0) && (
        <div className="rounded-xl border border-border bg-card/60 overflow-hidden">
          <Tabs className="w-full">
            <TabsList className="w-full flex-wrap justify-start gap-2 rounded-none border-b border-border bg-muted/60 p-2 h-auto">
              {showLoggedOn && (
                <TabsTrigger
                  value="loggedOn"
                  className="gap-1.5 rounded-lg border border-border bg-background/70 px-3 py-2 text-xs font-semibold text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow"
                >
                  <Plane className="w-3.5 h-3.5" />
                  {t('dashboard.flightAnalysis.logDetails.loggedOn')}
                </TabsTrigger>
              )}
              {detailGroupsShown.length > 0 && (
                <TabsTrigger
                  value="details"
                  className="gap-1.5 rounded-lg border border-border bg-background/70 px-3 py-2 text-xs font-semibold text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow"
                >
                  <Cpu className="w-3.5 h-3.5" />
                  {t('dashboard.flightAnalysis.logDetails.title')}
                </TabsTrigger>
              )}
              {(mainEvents.length > 0 || appWarningEvents.length > 0) && (
                <TabsTrigger
                  value="events"
                  className="gap-1.5 rounded-lg border border-border bg-background/70 px-3 py-2 text-xs font-semibold text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow"
                >
                  <Activity className="w-3.5 h-3.5" />
                  {t('dashboard.flightAnalysis.flightEvents', { count: mainEvents.reduce((s, g) => s + g.count, 0) + appWarningEvents.reduce((s, g) => s + g.count, 0) })}
                </TabsTrigger>
              )}
            </TabsList>


            {showLoggedOn && (
              <TabsContent value="loggedOn" className="m-0 p-3">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-xs text-muted-foreground">
                    {t('dashboard.flightAnalysis.logDetails.loggedOnDescription')}
                  </span>
                  {canReassign && (
                    <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs shrink-0" onClick={() => setReassignOpen(true)}>
                      <Pencil className="w-3 h-3" />
                      {t('dashboard.flightAnalysis.logDetails.reassign')}
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { icon: Plane, label: t('dashboard.flightAnalysis.logDetails.loggedOnDrone'), value: s.droneName || s.droneModelName },
                    { icon: User, label: t('dashboard.flightAnalysis.logDetails.loggedOnPilot'), value: s.pilotName },
                    { icon: Target, label: t('dashboard.flightAnalysis.logDetails.loggedOnMission'), value: s.missionName },
                  ].map((row, i) => {
                    const Icon = row.icon;
                    return (
                      <div key={i} className="p-2.5 rounded-lg border border-border/60 bg-muted/30 space-y-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <Icon className="w-3 h-3" />{row.label}
                        </div>
                        <p className="text-sm font-medium break-words">
                          {row.value || <span className="text-muted-foreground">{t('dashboard.flightAnalysis.logDetails.loggedOnNone')}</span>}
                        </p>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 p-2.5 rounded-lg border border-border/60 bg-muted/20 space-y-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <FileText className="w-3 h-3" />
                    {t('dashboard.flightAnalysis.logDetails.traceTitle')}
                  </div>

                  {/* In drone logbook */}
                  <div className="flex items-start justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">{t('dashboard.flightAnalysis.logDetails.traceInDroneLogbook')}</span>
                    <span className={`font-medium text-right ${s.inDroneLogbook ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {s.inDroneLogbook ? t('common.yes') : t('common.no')}
                    </span>
                  </div>
                  {!s.inDroneLogbook && (
                    <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>{t('dashboard.flightAnalysis.logDetails.traceNoDroneHint')}</span>
                    </div>
                  )}

                  {/* In pilot logbook */}
                  <div className="flex items-start justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">{t('dashboard.flightAnalysis.logDetails.traceInPilotLogbook')}</span>
                    <span className={`font-medium text-right ${s.inPilotLogbook ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {s.inPilotLogbook ? t('common.yes') : t('common.no')}
                    </span>
                  </div>
                  {!s.inPilotLogbook && (
                    <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>{t('dashboard.flightAnalysis.logDetails.traceNoPilotHint')}</span>
                    </div>
                  )}

                  <div className="h-px bg-border/60 my-1" />

                  <div className="flex items-start justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">{t('dashboard.flightAnalysis.logDetails.traceContribution')}</span>
                    <span className="font-medium text-right">
                      {s.durationMinutes != null ? `${Math.round(s.durationMinutes)} min` : '–'}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">{t('dashboard.flightAnalysis.logDetails.traceDroneTotal')}</span>
                    <span className="font-medium text-right">
                      {s.droneTotalHours != null ? `${s.droneTotalHours.toFixed(1)} t` : '–'}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">{t('dashboard.flightAnalysis.logDetails.tracePilotTotal')}</span>
                    <span className="font-medium text-right">
                      {s.pilotTotalHours != null ? `${s.pilotTotalHours.toFixed(1)} t` : '–'}
                    </span>
                  </div>

                  <div className="h-px bg-border/60 my-1" />

                  <div className="flex items-start justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">{t('dashboard.flightAnalysis.logDetails.traceDroneWarningEntries')}</span>
                    <span className="font-medium text-right">{s.droneLogEntryCount ?? 0}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">{t('dashboard.flightAnalysis.logDetails.tracePilotNoteEntries')}</span>
                    <span className="font-medium text-right">{s.personnelLogEntryCount ?? 0}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {t('dashboard.flightAnalysis.logDetails.traceEntriesHint')}
                  </p>

                  {s.flightLogId && (
                    <div className="flex items-start justify-between gap-3 text-xs pt-1">
                      <span className="text-muted-foreground">{t('dashboard.flightAnalysis.logDetails.traceLogId')}</span>
                      <span className="font-mono text-right break-all">{String(s.flightLogId).slice(0, 8)}</span>
                    </div>
                  )}
                </div>

              </TabsContent>
            )}

            {detailGroupsShown.length > 0 && (
              <TabsContent value="details" className="m-0 p-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {detailGroupsShown.map((g, gi) => {
                    const Icon = g.icon;
                    return (
                      <div key={gi} className="p-2.5 rounded-lg border border-border/60 bg-muted/30 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <Icon className="w-3 h-3" />{g.title}
                        </div>
                        {g.rows.map((r, ri) => (
                          <div key={ri} className="flex items-start justify-between gap-3 text-xs">
                            <span className="text-muted-foreground shrink-0">{r.label}</span>
                            {r.mono ? (
                              <CopyableValue value={r.value as string} truncate={r.truncate} />
                            ) : (
                              <span className="font-medium text-right break-words">{r.value}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </TabsContent>
            )}

            {(mainEvents.length > 0 || appWarningEvents.length > 0) && (
              <TabsContent value="events" className="m-0 p-3 space-y-1.5">
                {[...mainEvents, ...appWarningEvents].map(({ ev, count }, i) => (
                  <div key={i} className="flex items-start gap-2 px-2 py-1.5 rounded-lg border border-border/60 bg-muted/30 text-xs">
                    {ev.type === "RTH" && <AlertTriangle className="w-3 h-3 text-destructive mt-0.5 shrink-0" />}
                    {ev.type === "LOW_BATTERY" && <Battery className="w-3 h-3 text-destructive mt-0.5 shrink-0" />}
                    {(ev.type === "error" || ev.type === "failsafe") && <AlertTriangle className="w-3 h-3 text-destructive mt-0.5 shrink-0" />}
                    {ev.type === "arm" && <LogIn className="w-3 h-3 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />}
                    {ev.type === "disarm" && <LogOut className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />}
                    {ev.type === "mode_change" && <Plane className="w-3 h-3 text-primary mt-0.5 shrink-0" />}
                    {ev.type === "APP_WARNING" && <Info className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />}
                    {!["RTH", "LOW_BATTERY", "error", "failsafe", "arm", "disarm", "mode_change", "APP_WARNING"].includes(ev.type) && (
                      <Info className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{ev.type}</span>
                        {count > 1 && <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 shrink-0">×{count}</Badge>}
                      </div>
                      {ev.message && <span className="text-muted-foreground break-words whitespace-normal">{ev.message}</span>}
                    </div>
                  </div>
                ))}
              </TabsContent>
            )}
          </Tabs>
        </div>
      )}

    </div>
  );
};
