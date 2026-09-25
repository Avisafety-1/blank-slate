import { useQueryClient } from "@tanstack/react-query";
import { getCachedData, setCachedData } from "@/lib/offlineCache";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/GlassCard";
import droneBackground from "@/assets/drone-background.png";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Activity, AlertTriangle, Clock, Package, Download, CalendarIcon, ChevronRight, ChevronLeft, AlertCircle, Sparkles, ChevronDown, RefreshCw, Loader2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MissionDetailDialog } from "@/components/dashboard/MissionDetailDialog";
import { AddIncidentDialog } from "@/components/dashboard/AddIncidentDialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, subMonths, startOfMonth, endOfMonth, startOfYear, parseISO, isValid } from "date-fns";
import { enUS, nb } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import * as XLSX from "xlsx";
import { summarizeUnplanned } from "@/lib/unplannedFlights";
import { aggregatePilotFlightTime, formatMinutesHM } from "@/lib/pilotFlightLogs";
import { generateStatusPdf, type StatusPdfData } from "@/lib/statusPdfExport";
import { buildStatusExportSections, createStatusCsv, createStatusWorkbook } from "@/lib/statusTabularExport";
import { buildFlownMissionRiskDistribution, type RiskDistributionItem } from "@/lib/statusRiskDistribution";


interface KPIData {
  totalMissions: number;
  completedMissions: number;
  totalFlightHours: number;
  incidentRate: number;
  activeResources: number;
  importedFlights: number;
  unplannedFlights: number;
}


interface MonthData {
  month: string;
  count: number;
}

interface StatusData {
  name: string;
  value: number;
}

const COLORS = {
  primary: "hsl(var(--primary))",
  destructive: "hsl(var(--destructive))",
  warning: "hsl(var(--status-yellow))",
  success: "hsl(var(--status-green))",
  muted: "hsl(var(--muted-foreground))",
};

const MISSION_TYPE_COLORS = ["#0EA5E9", "#22C55E", "#F59E0B", "#A855F7", "#EF4444", "#14B8A6", "#EC4899", "#84CC16", "#6366F1", "#F97316", "#64748B"];

const Status = () => {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language?.startsWith("en") ? enUS : nb;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, companyId, companyName: authCompanyName, parentCompanyName } = useAuth();
  const [loading, setLoading] = useState(true);
  const [timePeriod, setTimePeriod] = useState<"month" | "quarter" | "year" | "custom">("year");
  const [customDateFrom, setCustomDateFrom] = useState<Date | undefined>(undefined);
  const [customDateTo, setCustomDateTo] = useState<Date | undefined>(undefined);
  const [kpiData, setKpiData] = useState<KPIData>({
    totalMissions: 0,
    completedMissions: 0,
    totalFlightHours: 0,
    incidentRate: 0,
    activeResources: 0,
    importedFlights: 0,
    unplannedFlights: 0,
  });
  const [unplannedByMonth, setUnplannedByMonth] = useState<{ month: string; planned: number; unplanned: number }[]>([]);

  const [missionsByMonth, setMissionsByMonth] = useState<MonthData[]>([]);
  const [missionsByStatus, setMissionsByStatus] = useState<StatusData[]>([]);
  const [missionsByRisk, setMissionsByRisk] = useState<RiskDistributionItem[]>([]);
  const [incidentsByMonth, setIncidentsByMonth] = useState<MonthData[]>([]);
  const [incidentsByMainCause, setIncidentsByMainCause] = useState<StatusData[]>([]);
  const [incidentsByContributingCause, setIncidentsByContributingCause] = useState<StatusData[]>([]);
  const [incidentsBySeverity, setIncidentsBySeverity] = useState<StatusData[]>([]);
  const [daysSinceLastSevere, setDaysSinceLastSevere] = useState<number>(0);
  const [droneStatus, setDroneStatus] = useState<StatusData[]>([]);
  const [equipmentStatus, setEquipmentStatus] = useState<StatusData[]>([]);
  const [flightHoursByDrone, setFlightHoursByDrone] = useState<any[]>([]);
  const [operationTypeStats, setOperationTypeStats] = useState<{
    counts: { name: string; value: number }[];
    hours: { name: string; value: number }[];
    monthly: { month: string; VLOS: number; BVLOS: number; EVLOS: number }[];
    totalFlights: number;
    totalMinutes: number;
  }>({ counts: [], hours: [], monthly: [], totalFlights: 0, totalMinutes: 0 });
  const [flightTimeByPilot, setFlightTimeByPilot] = useState<Array<{ name: string; flights: number; minutes: number }>>([]);
  const [flownMissionsByType, setFlownMissionsByType] = useState<Array<{ name: string; value: number }>>([]);
  const [flownMissionsTypeMonthly, setFlownMissionsTypeMonthly] = useState<Array<Record<string, string | number>>>([]);
  const [pilotsOpen, setPilotsOpen] = useState(false);
  const [expiringDocs, setExpiringDocs] = useState<{ thirtyDays: number; sixtyDays: number; ninetyDays: number }>({
    thirtyDays: 0,
    sixtyDays: 0,
    ninetyDays: 0,
  });

  // Deviation reports view state
  const [activeView, setActiveView] = useState<"operations" | "incidents" | "deviation">("operations");
  const [deviationReports, setDeviationReports] = useState<Array<{
    id: string;
    mission_id: string | null;
    category_path: string[];
    comment: string | null;
    created_at: string;
    reported_by: string | null;
    reporter_name?: string | null;
  }>>([]);
  const [flightLogsCount, setFlightLogsCount] = useState(0);
  const [deviationDrillPath, setDeviationDrillPath] = useState<string[]>([]);
  const [deviationPage, setDeviationPage] = useState(1);
  const [companySettings, setCompanySettings] = useState<{ deviation_report_enabled: boolean }>({ deviation_report_enabled: false });
  const [missionDialogOpen, setMissionDialogOpen] = useState(false);
  const [selectedMission, setSelectedMission] = useState<any>(null);
  const [incidentDialogOpen, setIncidentDialogOpen] = useState(false);
  const [incidentMissionId, setIncidentMissionId] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const runAiAnalysis = async () => {
    setAiLoading(true);
    setAiText("");
    setAiOpen(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error(t("status.hookMessages.noActiveSession"));

      const periodLabel =
        timePeriod === "month" ? t("status.page.periodMonth") :
        timePeriod === "quarter" ? t("status.page.periodQuarter") :
        timePeriod === "year" ? t("status.page.periodYear") :
        timePeriod === "custom" && customDateFrom && customDateTo
          ? `${format(customDateFrom, "dd.MM.yyyy")} – ${format(customDateTo, "dd.MM.yyyy")}`
          : t("status.hookMessages.periodUnknown");

      // Hent flåtestørrelse (anonyme antall) for normalisering av risiko
      const visibleIds = await supabase
        .rpc("get_user_visible_company_ids", { _user_id: user!.id });
      const ids = (visibleIds.data as string[] | null) ?? (companyId ? [companyId] : []);

      const [droneCountRes, equipmentCountRes, personnelCountRes] = await Promise.all([
        supabase.from("drones").select("id", { count: "exact", head: true }).in("company_id", ids).eq("aktiv", true),
        supabase.from("equipment").select("id", { count: "exact", head: true }).in("company_id", ids).eq("aktiv", true),
        supabase.from("profiles").select("id", { count: "exact", head: true }).in("company_id", ids).eq("approved", true),
      ]);

      const sumByStatus = (arr: any[]) => {
        const out = { Grønn: 0, Gul: 0, Rød: 0 };
        for (const r of arr || []) {
          if (r?.name && r.name in out) (out as any)[r.name] = r.value || 0;
        }
        return out;
      };

      const resourceCounts = {
        drones: { total: droneCountRes.count ?? 0, ...sumByStatus(droneStatus) },
        equipment: { total: equipmentCountRes.count ?? 0, ...sumByStatus(equipmentStatus) },
        personnel: { total: personnelCountRes.count ?? 0 },
      };

      const payload = {
        periodLabel,
        resourceCounts,
        kpi: kpiData,
        missions: {
          byMonth: missionsByMonth,
          byStatus: missionsByStatus,
          byRisk: missionsByRisk,
        },
        incidents: {
          byMonth: incidentsByMonth,
          byMainCause: incidentsByMainCause,
          byContributingCause: incidentsByContributingCause,
          bySeverity: incidentsBySeverity,
          daysSinceLastSevere,
        },
        resources: {
          droneStatus,
          equipmentStatus,
          flightHoursByDrone,
        },
        operationTypes: operationTypeStats,
        expiringDocuments: expiringDocs,
        flightLogsCount,
        deviationReports: {
          enabled: companySettings.deviation_report_enabled,
          total: deviationReports.length,
          byCategory: deviationReports.reduce<Record<string, number>>((acc, r) => {
            const key = (r.category_path?.[0]) || "Ukategorisert";
            acc[key] = (acc[key] ?? 0) + 1;
            return acc;
          }, {}),
        },
      };

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/company-status-ai`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ payload }),
        }
      );

      if (!resp.ok || !resp.body) {
        let msg = t("status.hookMessages.aiAnalysisFailed");
        try { const j = await resp.json(); msg = j.error || msg; } catch {}
        if (resp.status === 429) msg = t("status.hookMessages.rateLimitReached");
        if (resp.status === 402) msg = t("status.hookMessages.creditsExhausted");
        toast.error(msg);
        setAiText(msg);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let assembled = "";
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { streamDone = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) { assembled += content; setAiText(assembled); }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }
    } catch (err) {
      console.error("AI analysis error:", err);
      const msg = err instanceof Error ? err.message : t("status.hookMessages.unknownErrorGeneric");
      toast.error(msg);
      setAiText(msg);
    } finally {
      setAiLoading(false);
    }
  };

  const openMissionFromDeviation = async (missionId: string) => {
    const { data, error } = await supabase
      .from("missions")
      .select("*, companies:company_id(id, navn)")
      .eq("id", missionId)
      .maybeSingle();
    if (error || !data) {
      toast.error(t("status.hookMessages.couldNotOpenMission"));
      return;
    }
    setSelectedMission(data);
    setMissionDialogOpen(true);
  };

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }

    // Don't fetch if custom period is selected but dates are incomplete
    if (timePeriod === "custom" && (!customDateFrom || !customDateTo)) {
      return;
    }

    fetchAllStatistics();
  }, [user, navigate, timePeriod, companyId, customDateFrom, customDateTo]);

  const fetchAllStatistics = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchKPIData(),
        fetchMissionStatistics(),
        fetchIncidentStatistics(),
        fetchResourceStatistics(),
        fetchDocumentStatistics(),
        fetchDeviationStatistics(),
        fetchOperationTypeStatistics(),
        fetchPilotAndMissionTypeStatistics(),
      ]);
      // Cache all state after successful fetch
      if (companyId) {
        setCachedData(`offline_status_loaded_${companyId}`, true);
      }
    } catch (error) {
      console.error("Error fetching statistics:", error);
      // Try loading from cache if offline
      if (!navigator.onLine && companyId) {
        const cached = getCachedData<any>(`offline_status_kpi_${companyId}`);
        if (cached) setKpiData(cached);
      }
    } finally {
      setLoading(false);
    }
  };

  const getDateFilter = (): { startDate: Date; endDate: Date } => {
    const now = new Date();
    
    if (timePeriod === "custom" && customDateFrom && customDateTo) {
      return { startDate: customDateFrom, endDate: customDateTo };
    }
    
    switch (timePeriod) {
      case "month":
        return { startDate: subMonths(now, 1), endDate: now };
      case "quarter":
        return { startDate: subMonths(now, 3), endDate: now };
      case "year":
      default:
        return { startDate: subMonths(now, 12), endDate: now };
    }
  };

  const getMonthsToShow = (): number => {
    if (timePeriod === "custom" && customDateFrom && customDateTo) {
      const diffTime = Math.abs(customDateTo.getTime() - customDateFrom.getTime());
      const diffMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30));
      return Math.max(1, diffMonths);
    }
    return timePeriod === "month" ? 1 : timePeriod === "quarter" ? 3 : 12;
  };

  const fetchKPIData = async () => {
    const { startDate, endDate } = getDateFilter();
    
    const { data: missions } = await supabase
      .from("missions")
      .select("status, tidspunkt")
      .gte("tidspunkt", startDate.toISOString())
      .lte("tidspunkt", endDate.toISOString());
    const { data: drones } = await supabase.from("drones").select("flyvetimer, aktiv");
    const { data: equipment } = await supabase.from("equipment").select("aktiv");
    const { data: incidents } = await supabase
      .from("incidents")
      .select("*")
      .gte("hendelsestidspunkt", startDate.toISOString())
      .lte("hendelsestidspunkt", endDate.toISOString());

    // Imported flight logs (DJI / ArduPilot) and how many were never planned in advance
    const { data: importedLogs } = await (supabase as any)
      .from("flight_logs")
      .select("id, flight_date, start_time_utc, source, mission_id, missions(opprettet_dato)")
      .not("source", "is", null)
      .neq("source", "manual")
      .gte("flight_date", startDate.toISOString())
      .lte("flight_date", endDate.toISOString());

    const monthsToShow = getMonthsToShow();
    const monthOrder: string[] = [];
    for (let i = monthsToShow - 1; i >= 0; i--) {
      monthOrder.push(format(subMonths(endDate, i), "MMM yyyy", { locale: dateLocale }));
    }
    const unplannedSummary = summarizeUnplanned(
      (importedLogs || []) as any[],
      (d) => format(d, "MMM yyyy", { locale: dateLocale }),
      monthOrder
    );
    setUnplannedByMonth(unplannedSummary.byMonth);

    const totalMissions = missions?.length || 0;
    const completedMissions = missions?.filter((m) => m.status === "Fullført").length || 0;
    const totalFlightHours = drones?.reduce((sum, d) => sum + (d.flyvetimer || 0), 0) || 0;
    const activeDrones = drones?.filter((d) => d.aktiv).length || 0;
    const activeEquipment = equipment?.filter((e) => e.aktiv).length || 0;
    const incidentRate = totalFlightHours > 0 ? ((incidents?.length || 0) / totalFlightHours) * 100 : 0;

    setKpiData({
      totalMissions,
      completedMissions,
      totalFlightHours,
      importedFlights: unplannedSummary.total,
      unplannedFlights: unplannedSummary.unplanned,

      incidentRate,
      activeResources: activeDrones + activeEquipment,
    });
  };

  const fetchMissionStatistics = async () => {
    const { startDate, endDate } = getDateFilter();
    
    const { data: missions } = await supabase
      .from("missions")
      .select("tidspunkt, status")
      .gte("tidspunkt", startDate.toISOString())
      .lte("tidspunkt", endDate.toISOString()) as any;

    if (!missions) return;

    // Missions by month (based on selected period)
    const monthsToShow = getMonthsToShow();
    const monthlyData: { [key: string]: number } = {};
    for (let i = monthsToShow - 1; i >= 0; i--) {
      const monthDate = subMonths(endDate, i);
      const monthKey = format(monthDate, "MMM yyyy", { locale: dateLocale });
      monthlyData[monthKey] = 0;
    }

    missions.forEach((mission: any) => {
      const missionDate = new Date(mission.tidspunkt);
      const monthKey = format(missionDate, "MMM yyyy", { locale: dateLocale });
      if (monthlyData[monthKey] !== undefined) {
        monthlyData[monthKey]++;
      }
    });

    setMissionsByMonth(
      Object.entries(monthlyData).map(([month, count]) => ({ month, count }))
    );

    // Missions by status
    const statusCounts: { [key: string]: number } = {};
    missions.forEach((m: any) => {
      statusCounts[m.status] = (statusCounts[m.status] || 0) + 1;
    });
    setMissionsByStatus(
      Object.entries(statusCounts).map(([name, value]) => ({ name, value }))
    );

    const flownMissionIds = new Set<string>();
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data: flightLogs, error } = await supabase
        .from("flight_logs")
        .select("mission_id")
        .not("mission_id", "is", null)
        .gte("flight_date", startDate.toISOString())
        .lte("flight_date", endDate.toISOString())
        .range(from, from + pageSize - 1);
      if (error) throw error;
      (flightLogs || []).forEach((log) => {
        if (log.mission_id) flownMissionIds.add(log.mission_id);
      });
      if (!flightLogs || flightLogs.length < pageSize) break;
    }

    const missionIds = Array.from(flownMissionIds);
    const assessments: Array<{
      mission_id: string;
      overall_score: number | string | null;
      recommendation: string | null;
      created_at: string;
    }> = [];
    for (let offset = 0; offset < missionIds.length; offset += 200) {
      const chunk = missionIds.slice(offset, offset + 200);
      for (let from = 0; ; from += pageSize) {
        const { data: rows, error } = await supabase
          .from("mission_risk_assessments")
          .select("mission_id, overall_score, recommendation, created_at")
          .in("mission_id", chunk)
          .order("created_at", { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        assessments.push(...(rows || []));
        if (!rows || rows.length < pageSize) break;
      }
    }

    setMissionsByRisk(buildFlownMissionRiskDistribution(missionIds, assessments, {
      go: { name: t("status.metrics.riskGo"), scoreRange: t("status.metrics.riskGoRange") },
      caution: { name: t("status.metrics.riskCaution"), scoreRange: t("status.metrics.riskCautionRange") },
      "no-go": { name: t("status.metrics.riskNoGo"), scoreRange: t("status.metrics.riskNoGoRange") },
      "not-assessed": { name: t("status.metrics.riskNotAssessed"), scoreRange: t("status.metrics.riskNotAssessedRange") },
    }));
  };

  const fetchIncidentStatistics = async () => {
    const { startDate, endDate } = getDateFilter();
    
    const { data: incidents } = await supabase
      .from("incidents")
      .select("hendelsestidspunkt, hovedaarsak, medvirkende_aarsak, alvorlighetsgrad")
      .gte("hendelsestidspunkt", startDate.toISOString())
      .lte("hendelsestidspunkt", endDate.toISOString())
      .order("hendelsestidspunkt", { ascending: false });

    if (!incidents) return;

    // Incidents by month (based on selected period)
    const monthsToShow = getMonthsToShow();
    const monthlyData: { [key: string]: number } = {};
    for (let i = monthsToShow - 1; i >= 0; i--) {
      const monthDate = subMonths(endDate, i);
      const monthKey = format(monthDate, "MMM yyyy", { locale: dateLocale });
      monthlyData[monthKey] = 0;
    }

    incidents.forEach((incident) => {
      const incidentDate = new Date(incident.hendelsestidspunkt);
      const monthKey = format(incidentDate, "MMM yyyy", { locale: dateLocale });
      if (monthlyData[monthKey] !== undefined) {
        monthlyData[monthKey]++;
      }
    });

    setIncidentsByMonth(
      Object.entries(monthlyData).map(([month, count]) => ({ month, count }))
    );

    // Incidents by main cause (hovedårsak)
    const mainCauseCounts: { [key: string]: number } = {};
    incidents.forEach((i) => {
      const cause = i.hovedaarsak || "Ikke angitt";
      mainCauseCounts[cause] = (mainCauseCounts[cause] || 0) + 1;
    });
    setIncidentsByMainCause(
      Object.entries(mainCauseCounts).map(([name, value]) => ({ name, value }))
    );

    // Incidents by contributing cause (medvirkende årsak)
    const contributingCauseCounts: { [key: string]: number } = {};
    incidents.forEach((i) => {
      const cause = i.medvirkende_aarsak || "Ikke angitt";
      contributingCauseCounts[cause] = (contributingCauseCounts[cause] || 0) + 1;
    });
    setIncidentsByContributingCause(
      Object.entries(contributingCauseCounts)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
    );

    // Incidents by severity
    const severityCounts: { [key: string]: number } = {};
    incidents.forEach((i) => {
      severityCounts[i.alvorlighetsgrad] = (severityCounts[i.alvorlighetsgrad] || 0) + 1;
    });
    setIncidentsBySeverity(
      Object.entries(severityCounts).map(([name, value]) => ({ name, value }))
    );

    // Days since last severe incident
    const severeIncident = incidents.find((i) => i.alvorlighetsgrad === "Alvorlig");
    if (severeIncident) {
      const daysSince = Math.floor(
        (new Date().getTime() - new Date(severeIncident.hendelsestidspunkt).getTime()) /
          (1000 * 60 * 60 * 24)
      );
      setDaysSinceLastSevere(daysSince);
    } else {
      setDaysSinceLastSevere(999);
    }
  };

  const fetchResourceStatistics = async () => {
    const { data: drones } = await supabase.from("drones").select("status, flyvetimer, modell, serienummer");
    const { data: equipment } = await supabase.from("equipment").select("status");

    if (drones) {
      const statusCounts: { [key: string]: number } = {};
      drones.forEach((d) => {
        statusCounts[d.status] = (statusCounts[d.status] || 0) + 1;
      });
      setDroneStatus(Object.entries(statusCounts).map(([name, value]) => ({ name, value })));

      // Flight hours by drone (top 10)
      const sortedDrones = [...drones]
        .sort((a, b) => b.flyvetimer - a.flyvetimer)
        .slice(0, 10)
        .map((d) => ({
          name: `${d.modell} (SN: ${d.serienummer})`,
          hours: d.flyvetimer,
        }));
      setFlightHoursByDrone(sortedDrones);
    }

    if (equipment) {
      const statusCounts: { [key: string]: number } = {};
      equipment.forEach((e) => {
        statusCounts[e.status] = (statusCounts[e.status] || 0) + 1;
      });
      setEquipmentStatus(Object.entries(statusCounts).map(([name, value]) => ({ name, value })));
    }
  };

  const fetchDocumentStatistics = async () => {
    const { data: documents } = await supabase.from("documents").select("gyldig_til");

    if (!documents) return;

    const now = new Date();
    const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const sixtyDays = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    const ninetyDays = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    let thirtyCount = 0;
    let sixtyCount = 0;
    let ninetyCount = 0;

    documents.forEach((doc) => {
      if (!doc.gyldig_til) return;
      const expiryDate = new Date(doc.gyldig_til);
      if (expiryDate > now && expiryDate <= thirtyDays) thirtyCount++;
      else if (expiryDate > thirtyDays && expiryDate <= sixtyDays) sixtyCount++;
      else if (expiryDate > sixtyDays && expiryDate <= ninetyDays) ninetyCount++;
    });
    setExpiringDocs({ thirtyDays: thirtyCount, sixtyDays: sixtyCount, ninetyDays: ninetyCount });
  };

  const fetchDeviationStatistics = async () => {
    if (!companyId) return;
    const { startDate, endDate } = getDateFilter();

    // Fetch company setting
    const { data: companyData } = await supabase
      .from("companies")
      .select("deviation_report_enabled")
      .eq("id", companyId)
      .single();
    setCompanySettings({ deviation_report_enabled: (companyData as any)?.deviation_report_enabled ?? false });

    // Fetch reports in period
    const { data: reports, error } = await (supabase as any)
      .from("mission_deviation_reports")
      .select("id, mission_id, category_path, comment, created_at, reported_by")
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString())
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Deviation] fetch error", error);
      setDeviationReports([]);
      return;
    }

    const rows = (reports || []) as any[];
    const ids = Array.from(new Set(rows.map((r) => r.reported_by).filter(Boolean) as string[]));
    let nameMap: Record<string, string> = {};
    if (ids.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      nameMap = Object.fromEntries((profs || []).map((p: any) => [p.id, p.full_name]));
    }
    setDeviationReports(rows.map((r) => ({ ...r, reporter_name: r.reported_by ? nameMap[r.reported_by] : null })));

    // Total flight logs in period for ratio KPI
    const { count } = await supabase
      .from("flight_logs")
      .select("id", { count: "exact", head: true })
      .gte("flight_date", startDate.toISOString().slice(0, 10))
      .lte("flight_date", endDate.toISOString().slice(0, 10));
    setFlightLogsCount(count || 0);
  };

  const fetchPilotAndMissionTypeStatistics = async () => {
    const { startDate, endDate } = getDateFilter();
    const from = startDate.toISOString().slice(0, 10);
    const to = endDate.toISOString().slice(0, 10);
    const logs: Array<{ id: string; user_id: string | null; mission_id: string | null; flight_duration_minutes: number | null; flight_date: string }> = [];
    for (let page = 0; ; page += 1) {
      const { data, error } = await supabase
        .from("flight_logs")
        .select("id, user_id, mission_id, flight_duration_minutes, flight_date")
        .gte("flight_date", from)
        .lte("flight_date", to)
        .order("id")
        .range(page * 1000, page * 1000 + 999);
      if (error || !data) break;
      logs.push(...(data as any[]));
      if (data.length < 1000) break;
    }
    const chunk = <T,>(arr: T[], size = 200) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

    const links: Array<{ flight_log_id: string; profile_id: string }> = [];
    for (const ids of chunk(logs.map((l) => l.id))) {
      const { data } = await (supabase as any).from("flight_log_personnel").select("flight_log_id, profile_id").in("flight_log_id", ids);
      links.push(...((data || []) as any[]));
    }
    const pilotStats = aggregatePilotFlightTime(logs, links);
    const profileIds = Array.from(pilotStats.keys());
    const names: Record<string, string> = {};
    for (const ids of chunk(profileIds)) {
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      (data || []).forEach((p: any) => { names[p.id] = p.full_name; });
    }
    setFlightTimeByPilot(
      Array.from(pilotStats, ([id, v]) => ({ name: names[id] || t("status.hookMessages.export.unknown"), ...v }))
        .sort((a, b) => b.minutes - a.minutes),
    );

    // Flown missions per company mission type
    const missionIds = Array.from(new Set(logs.map((l) => l.mission_id).filter(Boolean))) as string[];
    const firstFlight = new Map<string, string>();
    logs.forEach((l) => {
      if (!l.mission_id) return;
      const cur = firstFlight.get(l.mission_id);
      if (!cur || l.flight_date < cur) firstFlight.set(l.mission_id, l.flight_date);
    });
    const missionTypes: Array<{ type: string | null; month: string }> = [];
    for (const ids of chunk(missionIds)) {
      const { data } = await supabase.from("missions").select("id, oppdragstype").in("id", ids);
      (data || []).forEach((m: any) => missionTypes.push({
        type: m.oppdragstype,
        month: format(new Date(firstFlight.get(m.id) || from), "MMM yyyy", { locale: dateLocale }),
      }));
    }
    let typeSource = companyId;
    if (companyId) {
      const { data: comp } = await (supabase as any).from("companies").select("parent_company_id").eq("id", companyId).maybeSingle();
      if (comp?.parent_company_id) {
        const { data: parent } = await (supabase as any).from("companies").select("propagate_mission_types").eq("id", comp.parent_company_id).maybeSingle();
        if (parent?.propagate_mission_types) typeSource = comp.parent_company_id;
      }
    }
    const { data: typeRows } = typeSource
      ? await (supabase as any).from("company_mission_types").select("label, sort_order").eq("company_id", typeSource).order("sort_order").order("label")
      : { data: [] };
    const labels: string[] = (typeRows || []).map((r: any) => r.label);
    const counts = new Map<string, number>(labels.map((l) => [l, 0]));
    const other = t("status.missionTypes.other");
    const months: string[] = [];
    for (let i = getMonthsToShow() - 1; i >= 0; i--) months.push(format(subMonths(endDate, i), "MMM yyyy", { locale: dateLocale }));
    const monthly = new Map<string, Map<string, number>>(months.map((m) => [m, new Map()]));
    missionTypes.forEach(({ type, month }) => {
      const key = type && counts.has(type) ? type : other;
      counts.set(key, (counts.get(key) || 0) + 1);
      if (!monthly.has(month)) monthly.set(month, new Map());
      const mm = monthly.get(month)!;
      mm.set(key, (mm.get(key) || 0) + 1);
    });
    if (counts.get(other) === 0) counts.delete(other);
    const typeList = Array.from(counts, ([name, value]) => ({ name, value }));
    setFlownMissionsByType(typeList);
    setFlownMissionsTypeMonthly(Array.from(monthly, ([month, mm]) => ({
      month,
      ...Object.fromEntries(typeList.map((tp, i) => [`t${i}`, mm.get(tp.name) || 0])),
    })));
  };

  const fetchOperationTypeStatistics = async () => {
    const { startDate, endDate } = getDateFilter();

    const { data: logs } = await supabase
      .from("flight_logs")
      .select("operation_type, flight_duration_minutes, flight_date")
      .gte("flight_date", startDate.toISOString().slice(0, 10))
      .lte("flight_date", endDate.toISOString().slice(0, 10));

    const rows = (logs || []) as Array<{
      operation_type: string | null;
      flight_duration_minutes: number | null;
      flight_date: string;
    }>;

    const types: Array<"VLOS" | "BVLOS" | "EVLOS"> = ["VLOS", "BVLOS", "EVLOS"];
    const countMap: Record<string, number> = { VLOS: 0, BVLOS: 0, EVLOS: 0 };
    const minutesMap: Record<string, number> = { VLOS: 0, BVLOS: 0, EVLOS: 0 };

    rows.forEach((r) => {
      const t = (r.operation_type as "VLOS" | "BVLOS" | "EVLOS") || "VLOS";
      const safeType = types.includes(t) ? t : "VLOS";
      countMap[safeType]++;
      minutesMap[safeType] += Number(r.flight_duration_minutes || 0);
    });

    const monthsToShow = getMonthsToShow();
    const monthly: Record<string, { VLOS: number; BVLOS: number; EVLOS: number }> = {};
    for (let i = monthsToShow - 1; i >= 0; i--) {
      const monthDate = subMonths(endDate, i);
      const key = format(monthDate, "MMM yyyy", { locale: dateLocale });
      monthly[key] = { VLOS: 0, BVLOS: 0, EVLOS: 0 };
    }
    rows.forEach((r) => {
      const monthKey = format(new Date(r.flight_date), "MMM yyyy", { locale: dateLocale });
      if (!monthly[monthKey]) return;
      const t = (r.operation_type as "VLOS" | "BVLOS" | "EVLOS") || "VLOS";
      const safeType = types.includes(t) ? t : "VLOS";
      monthly[monthKey][safeType]++;
    });

    setOperationTypeStats({
      counts: types.map((t) => ({ name: t, value: countMap[t] })),
      hours: types.map((t) => ({ name: t, value: +(minutesMap[t] / 60).toFixed(2) })),
      monthly: Object.entries(monthly).map(([month, v]) => ({ month, ...v })),
      totalFlights: rows.length,
      totalMinutes: minutesMap.VLOS + minutesMap.BVLOS + minutesMap.EVLOS,
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background via-background/95 to-background/90">
        <main className="container mx-auto px-4 py-8">
          <div className="text-center">{t("status.page.loading")}</div>
        </main>
      </div>
    );
  }

  const completionRate = kpiData.totalMissions > 0
    ? ((kpiData.completedMissions / kpiData.totalMissions) * 100).toFixed(1)
    : "0";

  const unplannedPct = kpiData.importedFlights > 0
    ? (kpiData.unplannedFlights / kpiData.importedFlights) * 100
    : 0;

  const getReportPeriodLabel = () => timePeriod === "custom" && customDateFrom && customDateTo
    ? `${format(customDateFrom, "dd.MM.yyyy", { locale: dateLocale })} – ${format(customDateTo, "dd.MM.yyyy", { locale: dateLocale })}`
    : timePeriod === "month"
      ? t("status.page.periodMonth")
      : timePeriod === "quarter"
        ? t("status.page.periodQuarter")
        : t("status.page.periodYear");

  const getStatusReportData = (reportCompanyName: string): StatusPdfData => {
    const monthsToShow = getMonthsToShow();
    const { endDate } = getDateFilter();
    const deviationMonthCounts = new Map<string, number>();
    for (let i = monthsToShow - 1; i >= 0; i -= 1) {
      deviationMonthCounts.set(format(subMonths(endDate, i), "MMM yyyy", { locale: dateLocale }), 0);
    }
    deviationReports.forEach((report) => {
      const key = format(new Date(report.created_at), "MMM yyyy", { locale: dateLocale });
      if (deviationMonthCounts.has(key)) deviationMonthCounts.set(key, (deviationMonthCounts.get(key) || 0) + 1);
    });

    return {
      companyName: reportCompanyName,
      language: i18n.language?.startsWith("en") ? "en" : "no",
      periodLabel: getReportPeriodLabel(),
      generatedLabel: format(new Date(), i18n.language?.startsWith("en") ? "dd.MM.yyyy HH:mm" : "dd.MM.yyyy 'kl.' HH:mm", { locale: dateLocale }),
      kpis: { ...kpiData, completionRate },
      missionsByMonth,
      missionsByStatus,
      missionsByRisk,
      operationTypes: operationTypeStats,
      unplannedByMonth,
      incidentsByMonth,
      incidentsByMainCause,
      incidentsByContributingCause,
      incidentsBySeverity,
      daysSinceLastSevere,
      droneStatus,
      equipmentStatus,
      flightHoursByDrone,
      flightTimeByPilot,
      flownMissionsByType,
      flownMissionsTypeMonthly,
      expiringDocs,
      deviationEnabled: companySettings.deviation_report_enabled,
      flightLogsCount,
      deviationsByMonth: Array.from(deviationMonthCounts, ([month, count]) => ({ month, count })),
      deviationReports,
    };
  };

  const handleExportExcel = async () => {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id, full_name, companies(navn)")
        .eq("id", user?.id)
        .single();
      if (!profile?.company_id) {
        throw new Error(t("status.hookMessages.couldNotFetchCompanyInfo"));
      }

      const reportCompanyName = (profile as any)?.companies?.navn || t("status.hookMessages.unknownCompany");
      const workbook = createStatusWorkbook(buildStatusExportSections(getStatusReportData(reportCompanyName), t));
      const fileName = `statistikk-rapport-${format(new Date(), "yyyy-MM-dd-HHmmss")}.xlsx`;
      const workbookOutput = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
      const blob = new Blob([workbookOutput], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

      const filePath = `${profile.company_id}/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, blob, {
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          upsert: true
        });

      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase
        .from('documents')
        .insert({
          tittel: `${t("status.hookMessages.export.reportTitlePrefix")} - ${getReportPeriodLabel()}`,
          kategori: t("status.hookMessages.export.docCategory"),
          beskrivelse: t("status.hookMessages.export.excelDescription", { date: format(new Date(), i18n.language?.startsWith("en") ? "dd.MM.yyyy HH:mm" : "dd.MM.yyyy 'kl.' HH:mm", { locale: dateLocale }) }),
          fil_navn: fileName,
          fil_url: filePath,
          fil_storrelse: blob.size,
          company_id: profile.company_id,
          user_id: user?.id,
        });


      if (dbError) throw dbError;

      XLSX.writeFile(workbook, fileName);
      
      toast.success(t("status.hookMessages.excelSavedTitle"), {
        description: t("status.hookMessages.reportSavedDescription")
      });
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      toast.error(t("status.hookMessages.exportErrorTitle"), {
        description: t("status.hookMessages.excelExportErrorDescription")
      });
    }
  };

  const handleExportCSV = async () => {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id, full_name, companies(navn)")
        .eq("id", user?.id)
        .single();

      if (!profile?.company_id) throw new Error(t("status.hookMessages.couldNotFetchCompanyInfo"));

      const reportCompanyName = (profile as any)?.companies?.navn || t("status.hookMessages.unknownCompany");
      const csvContent = createStatusCsv(buildStatusExportSections(getStatusReportData(reportCompanyName), t));
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const fileName = `statistikk-rapport-${format(new Date(), "yyyy-MM-dd-HHmmss")}.csv`;

      const filePath = `${profile.company_id}/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, blob, { contentType: "text/csv", upsert: true });

      if (uploadError) throw uploadError;

      await supabase.from("documents").insert({
        tittel: t("status.hookMessages.export.csvTitleSuffix", { period: getReportPeriodLabel() }),
        kategori: t("status.hookMessages.export.docCategory"),
        beskrivelse: t("status.hookMessages.export.csvDescription", { date: format(new Date(), i18n.language?.startsWith("en") ? "dd.MM.yyyy HH:mm" : "dd.MM.yyyy 'kl.' HH:mm", { locale: dateLocale }) }),
        fil_navn: fileName,
        fil_url: filePath,
        fil_storrelse: blob.size,
        company_id: profile.company_id,
        user_id: user?.id,
        opprettet_av: profile?.full_name || user?.email || t("status.hookMessages.export.unknown"),
      });

      queryClient.invalidateQueries({ queryKey: ["documents"] });

      // Download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(t("status.hookMessages.csvSavedTitle"), {
        description: t("status.hookMessages.reportSavedDescription"),
      });
    } catch (error) {
      console.error("Error exporting to CSV:", error);
      toast.error(t("status.hookMessages.exportErrorTitle"), { description: t("status.hookMessages.csvExportErrorDescription") });
    }
  };

  const handleExportPDF = async () => {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id, full_name, companies(navn)")
        .eq("id", user?.id)
        .single();

      const reportCompanyName = (profile as any)?.companies?.navn || t("status.hookMessages.unknownCompany");
      const reportCompanyId = profile?.company_id;
      if (!reportCompanyId) throw new Error(t("status.hookMessages.couldNotFetchCompanyInfo"));

      const periodLabel = getReportPeriodLabel();
      const pdfBlob = await generateStatusPdf(getStatusReportData(reportCompanyName), t);

      const fileName = `statistikk-rapport-${format(new Date(), "yyyy-MM-dd-HHmmss")}.pdf`;
      const filePath = `${reportCompanyId}/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, pdfBlob, { contentType: "application/pdf", upsert: true });
      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase.from("documents").insert({
        tittel: `${t("status.hookMessages.export.reportTitlePrefix")} - ${periodLabel}`,
        kategori: t("status.hookMessages.export.docCategory"),
        beskrivelse: t("status.hookMessages.export.pdfDescription", {
          date: format(new Date(), i18n.language?.startsWith("en") ? "dd.MM.yyyy HH:mm" : "dd.MM.yyyy 'kl.' HH:mm", { locale: dateLocale }),
        }),
        fil_navn: fileName,
        fil_url: filePath,
        fil_storrelse: pdfBlob.size,
        company_id: reportCompanyId,
        user_id: user?.id,
      });
      if (dbError) throw dbError;

      const url = window.URL.createObjectURL(pdfBlob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(anchor);

      toast.success(t("status.hookMessages.pdfSavedTitle"), {
        description: t("status.hookMessages.reportSavedDescription"),
      });
    } catch (error) {
      console.error("Error exporting to PDF:", error);
      toast.error(t("status.hookMessages.exportErrorTitle"), {
        description: t("status.hookMessages.pdfExportErrorDescription"),
      });
    }
  };

  return (
    <div className="min-h-screen relative w-full overflow-x-hidden">
      {/* Background with gradient overlay */}
      <div
        className="fixed inset-0 z-0"
        style={{
          backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.5)), url(${droneBackground})`,
          backgroundSize: "cover",
          backgroundPosition: "center center",
          backgroundRepeat: "no-repeat",
        }}
      />

      {/* Content */}
      <div className="relative z-10 w-full">
      <main className="container mx-auto px-4 py-8 space-y-8">
        <div className="flex flex-col gap-4">
          <div className="bg-background/70 backdrop-blur-sm rounded-lg px-4 py-3 border border-border/30">
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground">{t("status.page.title")}</h1>
            {authCompanyName && (
              <p className="text-sm text-muted-foreground mt-1">
                {parentCompanyName
                  ? t("status.page.subtitleWithParent", { parent: parentCompanyName, company: authCompanyName })
                  : t("status.page.subtitleAllDepartments", { company: authCompanyName })}
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-row items-stretch sm:items-center gap-3 w-full bg-background/70 backdrop-blur-sm rounded-lg px-4 py-3 border border-border/30">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground whitespace-nowrap">{t("status.page.periodLabel")}</span>
              <Select value={timePeriod} onValueChange={(value: "month" | "quarter" | "year" | "custom") => setTimePeriod(value)}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">{t("status.page.periodMonth")}</SelectItem>
                  <SelectItem value="quarter">{t("status.page.periodQuarter")}</SelectItem>
                  <SelectItem value="year">{t("status.page.periodYear")}</SelectItem>
                  <SelectItem value="custom">{t("status.page.periodCustom")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {timePeriod === "custom" && (
              <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium text-foreground whitespace-nowrap">{t("status.page.fromLabel")}</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full sm:w-[140px] justify-start text-left font-normal text-xs sm:text-sm",
                          !customDateFrom && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                        <span className="truncate">{customDateFrom ? format(customDateFrom, "dd.MM.yy") : t("status.page.pickDate")}</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={customDateFrom}
                        onSelect={setCustomDateFrom}
                        disabled={(date) => customDateTo ? date > customDateTo : false}
                        initialFocus
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium text-foreground whitespace-nowrap">{t("status.page.toLabel")}</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full sm:w-[140px] justify-start text-left font-normal text-xs sm:text-sm",
                          !customDateTo && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                        <span className="truncate">{customDateTo ? format(customDateTo, "dd.MM.yy") : t("status.page.pickDate")}</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={customDateTo}
                        onSelect={setCustomDateTo}
                        disabled={(date) => customDateFrom ? date < customDateFrom : false}
                        initialFocus
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}
            
            <div className="lg:ml-auto flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                size="default"
                onClick={runAiAnalysis}
                disabled={aiLoading || loading}
                className="gap-2 w-full sm:w-auto disabled:opacity-100 disabled:bg-background disabled:text-foreground"
              >
                {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {aiLoading ? t("status.page.aiAnalyzing") : t("status.page.aiButton")}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="default" size="default" className="gap-2 w-full sm:w-auto">
                    <Download className="w-4 h-4" />
                    {t("status.page.exportButton")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[200px]">
                  <DropdownMenuItem onClick={handleExportExcel}>
                    <Download className="w-4 h-4 mr-2" />
                    {t("status.page.exportExcel")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportPDF}>
                    <Download className="w-4 h-4 mr-2" />
                    {t("status.page.exportPdf")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportCSV}>
                    <Download className="w-4 h-4 mr-2" />
                    {t("status.page.exportCsv")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

          {(aiOpen || aiText) && (
            <Collapsible open={aiOpen} onOpenChange={setAiOpen}>
              <GlassCard className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <CollapsibleTrigger className="flex items-center gap-2 font-semibold text-foreground flex-1 text-left">
                    <Sparkles className="w-4 h-4 text-primary" />
                    {t("status.page.aiPanelTitle")}
                    <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${aiOpen ? "rotate-180" : ""}`} />
                  </CollapsibleTrigger>
                  {aiText && !aiLoading && (
                    <Button size="sm" variant="ghost" onClick={runAiAnalysis} title={t("status.page.regenerate")}>
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                <CollapsibleContent>
                  <div className="mt-4 text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                    {aiText || (aiLoading ? t("status.page.aiGenerating") : "")}
                    {aiLoading && aiText && <span className="inline-block w-2 h-4 bg-primary/60 animate-pulse ml-1 align-middle" />}
                  </div>
                </CollapsibleContent>
              </GlassCard>
            </Collapsible>
          )}

          <ToggleGroup
            type="single"
            value={activeView}
            onValueChange={(v) => v && setActiveView(v as "operations" | "incidents" | "deviation")}
            className="justify-start"
          >
            <ToggleGroupItem value="operations" className="bg-muted text-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground border border-border">
              {t("status.page.tabOperations")}
            </ToggleGroupItem>
            <ToggleGroupItem value="incidents" className="bg-muted text-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground border border-border">
              {t("status.page.tabIncidents")}
            </ToggleGroupItem>
            <ToggleGroupItem value="deviation" className="bg-muted text-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground border border-border">
              {t("status.page.tabDeviations")}
            </ToggleGroupItem>
          </ToggleGroup>


        {activeView === "operations" && (<>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <GlassCard className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t("status.metrics.totalMissions")}</p>
                <p className="text-3xl font-bold text-foreground">{kpiData.totalMissions}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("status.metrics.completedPercent", { pct: completionRate })}
                </p>
              </div>
              <Activity className="w-10 h-10 text-primary opacity-70" />
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t("status.metrics.totalFlightHours")}</p>
                <p className="text-3xl font-bold text-foreground">{kpiData.totalFlightHours.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("status.metrics.hoursUnit")}</p>
              </div>
              <Clock className="w-10 h-10 text-primary opacity-70" />
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t("status.metrics.activeResources")}</p>
                <p className="text-3xl font-bold text-foreground">{kpiData.activeResources}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("status.metrics.dronesAndEquipment")}</p>
              </div>
              <Package className="w-10 h-10 text-primary opacity-70" />
            </div>
          </GlassCard>

          <GlassCard className="p-6 cursor-pointer hover:bg-muted/50 transition-colors">
            <div
              role="button"
              tabIndex={0}
              onClick={() => navigate("/oppdrag?tab=logs&unplanned=1")}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigate("/oppdrag?tab=logs&unplanned=1"); }}
              className="flex items-center justify-between"
            >

              <div>
                <p className="text-sm text-muted-foreground">{t("status.metrics.unplannedFlights")}</p>
                <p
                  className={cn(
                    "text-3xl font-bold",
                    unplannedPct >= 50
                      ? "text-destructive"
                      : unplannedPct >= 20
                        ? "text-status-yellow"
                        : "text-foreground"
                  )}
                >
                  {kpiData.unplannedFlights}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("status.metrics.unplannedOfImported", {
                    n: kpiData.unplannedFlights,
                    total: kpiData.importedFlights,
                    pct: unplannedPct.toFixed(0),
                  })}
                </p>
                <p className="text-[11px] text-muted-foreground/80 mt-1 max-w-[15rem]">
                  {t("status.metrics.unplannedExplainer")}
                </p>
              </div>
              <AlertCircle className="w-10 h-10 text-status-yellow opacity-70" />
            </div>
          </GlassCard>
        </div>

        {/* Flight time per pilot */}
        <GlassCard className="p-4">
          <Collapsible open={pilotsOpen} onOpenChange={setPilotsOpen}>
            <CollapsibleTrigger className="flex w-full items-center gap-2 font-semibold text-foreground text-left">
              <Clock className="w-4 h-4" />
              {t("status.pilotTime.title")}
              <span className="text-xs font-normal text-muted-foreground">({flightTimeByPilot.length})</span>
              <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${pilotsOpen ? "rotate-180" : ""}`} />
            </CollapsibleTrigger>
            <CollapsibleContent>
              {flightTimeByPilot.length === 0 ? (
                <p className="text-sm text-muted-foreground mt-3">{t("status.pilotTime.empty")}</p>
              ) : (
                <div className="overflow-x-auto mt-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground text-left">
                        <th className="py-2 pr-4 font-medium">{t("status.pilotTime.pilot")}</th>
                        <th className="py-2 pr-4 font-medium text-right">{t("status.pilotTime.flights")}</th>
                        <th className="py-2 font-medium text-right">{t("status.pilotTime.flightTime")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {flightTimeByPilot.map((row, i) => (
                        <tr key={`${row.name}-${i}`} className="border-b border-border/50 hover:bg-muted/50">
                          <td className="py-2 pr-4">{row.name}</td>
                          <td className="py-2 pr-4 text-right">{row.flights}</td>
                          <td className="py-2 text-right">{formatMinutesHM(row.minutes)}</td>
                        </tr>
                      ))}
                      <tr className="font-semibold">
                        <td className="py-2 pr-4">{t("status.pilotTime.total")}</td>
                        <td className="py-2 pr-4 text-right">{flightTimeByPilot.reduce((s, r) => s + r.flights, 0)}</td>
                        <td className="py-2 text-right">{formatMinutesHM(flightTimeByPilot.reduce((s, r) => s + r.minutes, 0))}</td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="text-[11px] text-muted-foreground mt-2">{t("status.pilotTime.note")}</p>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </GlassCard>

        {/* Mission Statistics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <GlassCard className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">
              {t("status.metrics.missionsByMonth")}
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={missionsByMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke={COLORS.primary}
                  strokeWidth={2}
                  name={t("status.metrics.missionsLegend")}
                />
              </LineChart>
            </ResponsiveContainer>
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">{t("status.metrics.missionsByStatus")}</h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={missionsByStatus}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: ${entry.value}`}
                  outerRadius={80}
                  fill={COLORS.primary}
                  dataKey="value"
                >
                  {missionsByStatus.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={Object.values(COLORS)[index % Object.values(COLORS).length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">
              {t("status.metrics.missionsByRisk")}
            </h2>
            <p className="mb-3 text-sm text-muted-foreground">{t("status.metrics.missionsByRiskScale")}</p>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={missionsByRisk}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="value" name={t("status.metrics.countLegend")}>
                  {missionsByRisk.map((entry) => (
                    <Cell
                      key={entry.key}
                      fill={entry.key === "go" ? COLORS.success : entry.key === "caution" ? COLORS.warning : entry.key === "no-go" ? COLORS.destructive : COLORS.muted}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">{t("status.metrics.hmsTitle")}</h2>
            <div className="flex items-center justify-center h-[300px]">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">
                  {t("status.metrics.daysSinceLastSevere")}
                </p>
                <p className="text-6xl font-bold text-foreground">{daysSinceLastSevere}</p>
                <p className="text-sm text-muted-foreground mt-2">{t("status.metrics.daysUnit")}</p>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Operation type (VLOS / BVLOS / EVLOS) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <GlassCard className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">
              {t("status.metrics.operationTypeDistribution")}
            </h2>
            {operationTypeStats.totalFlights === 0 ? (
              <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
                {t("status.metrics.noFlightsInPeriod")}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={operationTypeStats.counts.filter((c) => c.value > 0)}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    dataKey="value"
                    label={(entry: any) => `${entry.name}: ${entry.value}`}
                  >
                    {operationTypeStats.counts.filter((c) => c.value > 0).map((entry, idx) => {
                      const colorMap: Record<string, string> = {
                        VLOS: COLORS.success,
                        BVLOS: COLORS.destructive,
                        EVLOS: COLORS.warning,
                      };
                      return <Cell key={idx} fill={colorMap[entry.name] || COLORS.primary} />;
                    })}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">
              {t("status.metrics.hoursPerOperationType")}
            </h2>
            <div className="space-y-4 pt-4">
              {(["VLOS", "BVLOS", "EVLOS"] as const).map((type) => {
                const hours = operationTypeStats.hours.find((h) => h.name === type)?.value || 0;
                const totalH = operationTypeStats.totalMinutes / 60;
                const pct = totalH > 0 ? (hours / totalH) * 100 : 0;
                const colorMap: Record<string, string> = {
                  VLOS: COLORS.success,
                  BVLOS: COLORS.destructive,
                  EVLOS: COLORS.warning,
                };
                return (
                  <div key={type}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium text-foreground">{type}</span>
                      <span className="text-sm text-muted-foreground">
                        {hours.toFixed(1)} t ({pct.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: colorMap[type] }}
                      />
                    </div>
                  </div>
                );
              })}
              <div className="pt-3 border-t border-border text-xs text-muted-foreground">
                {t("status.metrics.totalHoursSummary", { hours: (operationTypeStats.totalMinutes / 60).toFixed(1), flights: operationTypeStats.totalFlights })}
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">
              {t("status.metrics.operationTypeByMonth")}
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={operationTypeStats.monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
                <Bar dataKey="VLOS" stackId="op" fill={COLORS.success} />
                <Bar dataKey="BVLOS" stackId="op" fill={COLORS.destructive} />
                <Bar dataKey="EVLOS" stackId="op" fill={COLORS.warning} />
              </BarChart>
            </ResponsiveContainer>
          </GlassCard>
        </div>

        {/* Planned vs unplanned imported flights */}
        <GlassCard className="p-6">
          <h2 className="text-xl font-semibold mb-1 text-foreground">
            {t("status.metrics.unplannedByMonth")}
          </h2>
          <p className="text-xs text-muted-foreground mb-4">{t("status.metrics.unplannedExplainer")}</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={unplannedByMonth}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
              <YAxis stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
              />
              <Legend />
              <Bar
                dataKey="planned"
                stackId="a"
                name={t("status.metrics.plannedLegend")}
                fill={COLORS.success}
              />
              <Bar
                dataKey="unplanned"
                stackId="a"
                name={t("status.metrics.unplannedLegend")}
                fill={COLORS.warning}
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>


        {/* Flown missions per mission type */}
        <GlassCard className="p-6">
          <h2 className="text-xl font-semibold mb-1 text-foreground">{t("status.missionTypes.title")}</h2>
          <p className="text-xs text-muted-foreground mb-4">{t("status.missionTypes.explainer")}</p>
          {flownMissionsByType.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("status.missionTypes.empty")}</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={flownMissionsTypeMonthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                <Legend />
                {flownMissionsByType.map((tp, i) => (
                  <Bar
                    key={tp.name}
                    dataKey={`t${i}`}
                    stackId="types"
                    name={`${tp.name} (${tp.value})`}
                    fill={MISSION_TYPE_COLORS[i % MISSION_TYPE_COLORS.length]}
                    radius={i === flownMissionsByType.length - 1 ? [8, 8, 0, 0] : undefined}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </GlassCard>
        </>)}

        {/* Incident Statistics */}
        {activeView === "incidents" && (<>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <GlassCard className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t("status.metrics.incidentRate")}</p>
                <p className="text-3xl font-bold text-foreground">
                  {kpiData.incidentRate.toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{t("status.metrics.perHundredHours")}</p>
              </div>
              <AlertTriangle className="w-10 h-10 text-destructive opacity-70" />
            </div>
          </GlassCard>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <GlassCard className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">
              {t("status.incidents.incidentsByMonth")}
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={incidentsByMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="count" fill={COLORS.destructive} name={t("status.incidents.incidentsLegend")} />
              </BarChart>
            </ResponsiveContainer>
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">
              {t("status.incidents.mainCauseDistribution")}
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={incidentsByMainCause}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={80}
                  fill={COLORS.destructive}
                  dataKey="value"
                >
                  {incidentsByMainCause.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={Object.values(COLORS)[index % Object.values(COLORS).length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  formatter={(value, name) => [value, name]}
                />
                <Legend
                  layout="vertical"
                  align="right"
                  verticalAlign="middle"
                  formatter={(value) => (
                    <span style={{ fontSize: 12, whiteSpace: 'normal', wordBreak: 'break-word', maxWidth: 120, display: 'inline-block' }}>{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">
              {t("status.incidents.incidentsBySeverity")}
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={incidentsBySeverity}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="value" fill={COLORS.warning} name={t("status.metrics.countLegend")} />
              </BarChart>
            </ResponsiveContainer>
          </GlassCard>
        </div>

        {/* Contributing Causes - Full Width Horizontal Bar Chart */}
        <GlassCard className="p-6">
          <h2 className="text-xl font-semibold mb-4 text-foreground">
            {t("status.incidents.contributingCauses")}
          </h2>
          <ResponsiveContainer width="100%" height={Math.max(300, incidentsByContributingCause.length * 35)}>
            <BarChart data={incidentsByContributingCause} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" />
              <YAxis
                type="category"
                dataKey="name"
                stroke="hsl(var(--muted-foreground))"
                width={180}
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
              />
              <Bar dataKey="value" fill={COLORS.warning} name={t("status.metrics.countLegend")} />
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>

        </>)}

        {/* Resource & Document Overview */}
        {activeView === "operations" && (<>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <GlassCard className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">
              {t("status.services.droneStatusDistribution")}
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={droneStatus}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: ${entry.value}`}
                  outerRadius={80}
                  fill={COLORS.primary}
                  dataKey="value"
                >
                  {droneStatus.map((entry, index) => {
                    const colorMap: { [key: string]: string } = {
                      Grønn: COLORS.success,
                      Gul: COLORS.warning,
                      Rød: COLORS.destructive,
                    };
                    return <Cell key={`cell-${index}`} fill={colorMap[entry.name] || COLORS.muted} />;
                  })}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">
              {t("status.services.equipmentStatusDistribution")}
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={equipmentStatus}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: ${entry.value}`}
                  outerRadius={80}
                  fill={COLORS.primary}
                  dataKey="value"
                >
                  {equipmentStatus.map((entry, index) => {
                    const colorMap: { [key: string]: string } = {
                      Grønn: COLORS.success,
                      Gul: COLORS.warning,
                      Rød: COLORS.destructive,
                    };
                    return <Cell key={`cell-${index}`} fill={colorMap[entry.name] || COLORS.muted} />;
                  })}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">
              {t("status.services.flightHoursByDrone")}
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={flightHoursByDrone} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="hsl(var(--muted-foreground))"
                  width={150}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="hours" fill={COLORS.primary} name={t("status.services.hoursLegend")} />
              </BarChart>
            </ResponsiveContainer>
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">
              {t("status.services.expiringDocuments")}
            </h2>
            <div className="space-y-6 pt-8">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-muted-foreground">{t("status.services.within30Days")}</span>
                  <span className="text-2xl font-bold text-destructive">
                    {expiringDocs.thirtyDays}
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-destructive h-2 rounded-full"
                    style={{
                      width: `${Math.min(
                        (expiringDocs.thirtyDays /
                          Math.max(
                            expiringDocs.thirtyDays,
                            expiringDocs.sixtyDays,
                            expiringDocs.ninetyDays,
                            1
                          )) *
                          100,
                        100
                      )}%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-muted-foreground">{t("status.services.within60Days")}</span>
                  <span className="text-2xl font-bold text-warning">
                    {expiringDocs.sixtyDays}
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-warning h-2 rounded-full"
                    style={{
                      width: `${Math.min(
                        (expiringDocs.sixtyDays /
                          Math.max(
                            expiringDocs.thirtyDays,
                            expiringDocs.sixtyDays,
                            expiringDocs.ninetyDays,
                            1
                          )) *
                          100,
                        100
                      )}%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-muted-foreground">{t("status.services.within90Days")}</span>
                  <span className="text-2xl font-bold text-primary">
                    {expiringDocs.ninetyDays}
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full"
                    style={{
                      width: `${Math.min(
                        (expiringDocs.ninetyDays /
                          Math.max(
                            expiringDocs.thirtyDays,
                            expiringDocs.sixtyDays,
                            expiringDocs.ninetyDays,
                            1
                          )) *
                          100,
                        100
                      )}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </GlassCard>
        </div>
        </>)}

        {activeView === "deviation" && (() => {
          const monthsToShow = getMonthsToShow();
          const { endDate } = getDateFilter();
          const monthlyMap: Record<string, number> = {};
          for (let i = monthsToShow - 1; i >= 0; i--) {
            const d = subMonths(endDate, i);
            monthlyMap[format(d, "MMM yyyy", { locale: nb })] = 0;
          }
          deviationReports.forEach((r) => {
            const k = format(new Date(r.created_at), "MMM yyyy", { locale: nb });
            if (monthlyMap[k] !== undefined) monthlyMap[k]++;
          });
          const monthlyData = Object.entries(monthlyMap).map(([month, count]) => ({ month, count }));

          const filtered = deviationReports.filter((r) =>
            deviationDrillPath.every((seg, i) => r.category_path[i] === seg)
          );
          const level = deviationDrillPath.length;
          const distMap: Record<string, number> = {};
          filtered.forEach((r) => {
            const seg = r.category_path[level];
            if (seg) distMap[seg] = (distMap[seg] || 0) + 1;
          });
          const distData = Object.entries(distMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

          const rootMap: Record<string, number> = {};
          deviationReports.forEach((r) => {
            const root = r.category_path[0] || t("status.common.unknownCategory");
            rootMap[root] = (rootMap[root] || 0) + 1;
          });
          const rootData = Object.entries(rootMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

          const uniqueFlights = new Set(deviationReports.map((r) => r.mission_id).filter(Boolean)).size;
          const uniquePilots = new Set(deviationReports.map((r) => r.reported_by).filter(Boolean)).size;
          const avgPerFlight = flightLogsCount > 0 ? (deviationReports.length / flightLogsCount).toFixed(2) : "0";

          const PAGE_SIZE = 20;
          const totalPages = Math.max(1, Math.ceil(deviationReports.length / PAGE_SIZE));
          const pageRows = deviationReports.slice((deviationPage - 1) * PAGE_SIZE, deviationPage * PAGE_SIZE);

          return (
            <div className="space-y-6">
              {!companySettings.deviation_report_enabled && (
                <GlassCard className="p-6">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                    <div>
                      <p className="text-foreground font-medium">{t("status.incidents.deviation.notEnabledTitle")}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {t("status.incidents.deviation.notEnabledDescription")}
                      </p>
                      <Button variant="link" className="px-0 mt-2" onClick={() => navigate("/admin")}>
                        {t("status.incidents.deviation.goToSettings")}
                      </Button>
                    </div>
                  </div>
                </GlassCard>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <GlassCard className="p-6">
                  <p className="text-sm text-muted-foreground">{t("status.incidents.deviation.totalDeviations")}</p>
                  <p className="text-3xl font-bold text-foreground">{deviationReports.length}</p>
                </GlassCard>
                <GlassCard className="p-6">
                  <p className="text-sm text-muted-foreground">{t("status.incidents.deviation.uniqueFlights")}</p>
                  <p className="text-3xl font-bold text-foreground">{uniqueFlights}</p>
                </GlassCard>
                <GlassCard className="p-6">
                  <p className="text-sm text-muted-foreground">{t("status.incidents.deviation.uniquePilots")}</p>
                  <p className="text-3xl font-bold text-foreground">{uniquePilots}</p>
                </GlassCard>
                <GlassCard className="p-6">
                  <p className="text-sm text-muted-foreground">{t("status.incidents.deviation.avgPerFlight")}</p>
                  <p className="text-3xl font-bold text-foreground">{avgPerFlight}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t("status.incidents.deviation.flightsInPeriod", { count: flightLogsCount })}</p>
                </GlassCard>
              </div>

              {deviationReports.length === 0 ? (
                <GlassCard className="p-8 text-center">
                  <p className="text-muted-foreground">{t("status.incidents.deviation.noDeviationsInPeriod")}</p>
                </GlassCard>
              ) : (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <GlassCard className="p-6">
                      <h2 className="text-xl font-semibold mb-4 text-foreground">{t("status.incidents.deviation.perMonth")}</h2>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={monthlyData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
                          <YAxis stroke="hsl(var(--muted-foreground))" />
                          <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                          <Bar dataKey="count" fill={COLORS.warning} name={t("status.incidents.deviation.deviationsLegend")} />
                        </BarChart>
                      </ResponsiveContainer>
                    </GlassCard>

                    <GlassCard className="p-6">
                      <h2 className="text-xl font-semibold mb-4 text-foreground">{t("status.incidents.deviation.topCategories")}</h2>
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie data={rootData} cx="50%" cy="50%" labelLine={false} label={(e: any) => `${e.name}: ${e.value}`} outerRadius={80} dataKey="value">
                            {rootData.map((_, idx) => (
                              <Cell key={idx} fill={Object.values(COLORS)[idx % Object.values(COLORS).length]} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </GlassCard>
                  </div>

                  <GlassCard className="p-6">
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                      <h2 className="text-xl font-semibold text-foreground">{t("status.incidents.deviation.subcategoryDistribution")}</h2>
                      {deviationDrillPath.length > 0 && (
                        <Button variant="outline" size="sm" onClick={() => setDeviationDrillPath((p) => p.slice(0, -1))}>
                          <ChevronLeft className="w-4 h-4 mr-1" /> {t("status.incidents.deviation.back")}
                        </Button>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1 mb-4 text-sm">
                      <button onClick={() => setDeviationDrillPath([])} className="text-primary hover:underline">{t("status.incidents.deviation.all")}</button>
                      {deviationDrillPath.map((seg, i) => (
                        <span key={i} className="flex items-center gap-1">
                          <ChevronRight className="w-3 h-3 text-muted-foreground" />
                          <button onClick={() => setDeviationDrillPath(deviationDrillPath.slice(0, i + 1))} className="text-primary hover:underline">{seg}</button>
                        </span>
                      ))}
                    </div>
                    {distData.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-8 text-center">{t("status.incidents.deviation.noDeeperCategories")}</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={Math.max(300, distData.length * 35)}>
                        <BarChart data={distData} layout="vertical" onClick={(e: any) => {
                          const label = e?.activeLabel;
                          if (label) setDeviationDrillPath((p) => [...p, label]);
                        }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis type="number" stroke="hsl(var(--muted-foreground))" />
                          <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" width={180} tick={{ fontSize: 12 }} />
                          <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                          <Bar dataKey="value" fill={COLORS.primary} name={t("status.metrics.countLegend")} cursor="pointer" />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">{t("status.incidents.deviation.drillTip")}</p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h2 className="text-xl font-semibold mb-4 text-foreground">{t("status.incidents.deviation.details", { count: deviationReports.length })}</h2>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("status.incidents.deviation.tableDate")}</TableHead>
                          <TableHead>{t("status.incidents.deviation.tablePilot")}</TableHead>
                          <TableHead>{t("status.incidents.deviation.tableCategory")}</TableHead>
                          <TableHead>{t("status.incidents.deviation.tableComment")}</TableHead>
                          <TableHead className="text-right">{t("status.incidents.deviation.tableActions")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pageRows.map((r) => (
                          <TableRow
                            key={r.id}
                            className={r.mission_id ? "cursor-pointer hover:bg-muted/50" : ""}
                            onClick={() => r.mission_id && openMissionFromDeviation(r.mission_id)}
                          >
                            <TableCell className="whitespace-nowrap">{format(new Date(r.created_at), "dd.MM.yyyy HH:mm", { locale: nb })}</TableCell>
                            <TableCell>{r.reporter_name || t("status.incidents.deviation.unknown")}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap items-center gap-1">
                                {r.category_path.map((seg, i) => (
                                  <span key={i} className="flex items-center gap-1">
                                    {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                                    <span>{seg}</span>
                                  </span>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground italic">{r.comment || t("status.common.dash")}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={!r.mission_id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!r.mission_id) return;
                                  setIncidentMissionId(r.mission_id);
                                  setIncidentDialogOpen(true);
                                }}
                              >
                                <AlertCircle className="w-4 h-4 mr-1" />
                                {t("status.incidents.deviation.createIncident")}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-4">
                        <Button variant="outline" size="sm" disabled={deviationPage === 1} onClick={() => setDeviationPage((p) => p - 1)}>{t("status.incidents.deviation.pagePrevious")}</Button>
                        <span className="text-sm text-muted-foreground">{t("status.incidents.deviation.pageOf", { page: deviationPage, total: totalPages })}</span>
                        <Button variant="outline" size="sm" disabled={deviationPage === totalPages} onClick={() => setDeviationPage((p) => p + 1)}>{t("status.incidents.deviation.pageNext")}</Button>
                      </div>
                    )}
                  </GlassCard>
                </>
              )}
            </div>
          );
        })()}
      </main>
      </div>

      <MissionDetailDialog
        open={missionDialogOpen}
        onOpenChange={setMissionDialogOpen}
        mission={selectedMission}
        onMissionUpdated={fetchDeviationStatistics}
      />
      <AddIncidentDialog
        open={incidentDialogOpen}
        onOpenChange={setIncidentDialogOpen}
        defaultMissionId={incidentMissionId ?? undefined}
      />
    </div>
  );
};

export default Status;
