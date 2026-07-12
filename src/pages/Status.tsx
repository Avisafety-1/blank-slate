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
import { nb } from "date-fns/locale";
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
import autoTable from "jspdf-autotable";
import { createPdfDocument, setFontStyle, sanitizeForPdf, formatDateForPdf, getPdfFontName } from "@/lib/pdfUtils";

interface KPIData {
  totalMissions: number;
  completedMissions: number;
  totalFlightHours: number;
  incidentRate: number;
  activeResources: number;
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

const Status = () => {
  const { t } = useTranslation();
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
  });
  const [missionsByMonth, setMissionsByMonth] = useState<MonthData[]>([]);
  const [missionsByStatus, setMissionsByStatus] = useState<StatusData[]>([]);
  const [missionsByRisk, setMissionsByRisk] = useState<StatusData[]>([]);
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
  const [expiringDocs, setExpiringDocs] = useState<{ thirtyDays: number; sixtyDays: number; ninetyDays: number }>({
    thirtyDays: 0,
    sixtyDays: 0,
    ninetyDays: 0,
  });

  // Deviation reports view state
  const [activeView, setActiveView] = useState<"operational" | "deviation">("operational");
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
      incidentRate,
      activeResources: activeDrones + activeEquipment,
    });
  };

  const fetchMissionStatistics = async () => {
    const { startDate, endDate } = getDateFilter();
    
    const { data: missions } = await supabase
      .from("missions")
      .select("tidspunkt, status, risk_nivå")
      .gte("tidspunkt", startDate.toISOString())
      .lte("tidspunkt", endDate.toISOString()) as any;

    if (!missions) return;

    // Missions by month (based on selected period)
    const monthsToShow = getMonthsToShow();
    const monthlyData: { [key: string]: number } = {};
    for (let i = monthsToShow - 1; i >= 0; i--) {
      const monthDate = subMonths(endDate, i);
      const monthKey = format(monthDate, "MMM yyyy", { locale: nb });
      monthlyData[monthKey] = 0;
    }

    missions.forEach((mission: any) => {
      const missionDate = new Date(mission.tidspunkt);
      const monthKey = format(missionDate, "MMM yyyy", { locale: nb });
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

    // Missions by risk level
    const riskCounts: { [key: string]: number } = {};
    missions.forEach((m: any) => {
      riskCounts[m.risk_nivå] = (riskCounts[m.risk_nivå] || 0) + 1;
    });
    setMissionsByRisk(
      Object.entries(riskCounts).map(([name, value]) => ({ name, value }))
    );
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
      const monthKey = format(monthDate, "MMM yyyy", { locale: nb });
      monthlyData[monthKey] = 0;
    }

    incidents.forEach((incident) => {
      const incidentDate = new Date(incident.hendelsestidspunkt);
      const monthKey = format(incidentDate, "MMM yyyy", { locale: nb });
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
      const key = format(monthDate, "MMM yyyy", { locale: nb });
      monthly[key] = { VLOS: 0, BVLOS: 0, EVLOS: 0 };
    }
    rows.forEach((r) => {
      const monthKey = format(new Date(r.flight_date), "MMM yyyy", { locale: nb });
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

  const handleExportExcel = async () => {
    try {
      const wb = XLSX.utils.book_new();

      // KPI Sheet
      const kpiSheetData = [
        [t("status.hookMessages.export.kpiHeading"), ""],
        [t("status.hookMessages.export.totalMissions"), kpiData.totalMissions],
        [t("status.hookMessages.export.completedMissions"), kpiData.completedMissions],
        [t("status.hookMessages.export.completionRate"), `${completionRate}%`],
        [t("status.hookMessages.export.totalFlightHours"), kpiData.totalFlightHours],
        [t("status.hookMessages.export.incidentRate"), kpiData.incidentRate.toFixed(2)],
        [t("status.hookMessages.export.activeResources"), kpiData.activeResources],
      ];
      const wsKPI = XLSX.utils.aoa_to_sheet(kpiSheetData);
      XLSX.utils.book_append_sheet(wb, wsKPI, t("status.hookMessages.export.kpiSheet"));

      // Missions by Month
      const missionMonthData = [
        [t("status.hookMessages.export.monthHeader"), t("status.hookMessages.export.missionCountHeader")],
        ...missionsByMonth.map(item => [item.month, item.count])
      ];
      const wsMissionsMonth = XLSX.utils.aoa_to_sheet(missionMonthData);
      XLSX.utils.book_append_sheet(wb, wsMissionsMonth, t("status.hookMessages.export.missionsByMonthSheet"));

      // Missions by Status
      const missionStatusData = [
        [t("status.hookMessages.export.statusHeader"), t("status.hookMessages.export.countHeader")],
        ...missionsByStatus.map(item => [item.name, item.value])
      ];
      const wsMissionsStatus = XLSX.utils.aoa_to_sheet(missionStatusData);
      XLSX.utils.book_append_sheet(wb, wsMissionsStatus, t("status.hookMessages.export.missionsByStatusSheet"));

      // Missions by Risk
      const missionRiskData = [
        [t("status.hookMessages.export.riskLevelHeader"), t("status.hookMessages.export.countHeader")],
        ...missionsByRisk.map(item => [item.name, item.value])
      ];
      const wsMissionsRisk = XLSX.utils.aoa_to_sheet(missionRiskData);
      XLSX.utils.book_append_sheet(wb, wsMissionsRisk, t("status.hookMessages.export.missionsByRiskSheet"));

      // Incidents by Month
      const incidentMonthData = [
        [t("status.hookMessages.export.monthHeader"), t("status.hookMessages.export.incidentCountHeader")],
        ...incidentsByMonth.map(item => [item.month, item.count])
      ];
      const wsIncidentsMonth = XLSX.utils.aoa_to_sheet(incidentMonthData);
      XLSX.utils.book_append_sheet(wb, wsIncidentsMonth, t("status.hookMessages.export.incidentsByMonthSheet"));

      // Incidents by Main Cause
      const incidentMainCauseData = [
        [t("status.hookMessages.export.mainCauseHeader"), t("status.hookMessages.export.countHeader")],
        ...incidentsByMainCause.map(item => [item.name, item.value])
      ];
      const wsIncidentsMainCause = XLSX.utils.aoa_to_sheet(incidentMainCauseData);
      XLSX.utils.book_append_sheet(wb, wsIncidentsMainCause, t("status.hookMessages.export.mainCausesSheet"));

      // Incidents by Contributing Cause
      const incidentContributingData = [
        [t("status.hookMessages.export.contributingCauseHeader"), t("status.hookMessages.export.countHeader")],
        ...incidentsByContributingCause.map(item => [item.name, item.value])
      ];
      const wsIncidentsContributing = XLSX.utils.aoa_to_sheet(incidentContributingData);
      XLSX.utils.book_append_sheet(wb, wsIncidentsContributing, t("status.hookMessages.export.contributingCausesSheet"));

      // Incidents by Severity
      const incidentSeverityData = [
        [t("status.hookMessages.export.severityHeader"), t("status.hookMessages.export.countHeader")],
        ...incidentsBySeverity.map(item => [item.name, item.value])
      ];
      const wsIncidentsSeverity = XLSX.utils.aoa_to_sheet(incidentSeverityData);
      XLSX.utils.book_append_sheet(wb, wsIncidentsSeverity, t("status.hookMessages.export.incidentsBySeveritySheet"));

      // Drone Status
      const droneStatusData = [
        [t("status.hookMessages.export.statusHeader"), t("status.hookMessages.export.countHeader")],
        ...droneStatus.map(item => [item.name, item.value])
      ];
      const wsDroneStatus = XLSX.utils.aoa_to_sheet(droneStatusData);
      XLSX.utils.book_append_sheet(wb, wsDroneStatus, t("status.hookMessages.export.droneStatusSheet"));

      // Equipment Status
      const equipmentStatusData = [
        [t("status.hookMessages.export.statusHeader"), t("status.hookMessages.export.countHeader")],
        ...equipmentStatus.map(item => [item.name, item.value])
      ];
      const wsEquipmentStatus = XLSX.utils.aoa_to_sheet(equipmentStatusData);
      XLSX.utils.book_append_sheet(wb, wsEquipmentStatus, t("status.hookMessages.export.equipmentStatusSheet"));

      // Flight Hours by Drone
      const flightHoursData = [
        [t("status.hookMessages.export.droneHeader"), t("status.hookMessages.export.flightHoursHeader")],
        ...flightHoursByDrone.map(item => [item.name, item.hours])
      ];
      const wsFlightHours = XLSX.utils.aoa_to_sheet(flightHoursData);
      XLSX.utils.book_append_sheet(wb, wsFlightHours, t("status.hookMessages.export.flightHoursSheet"));

      // Expiring Documents
      const expiringDocsData = [
        [t("status.hookMessages.export.periodHeader"), t("status.hookMessages.export.docCountHeader")],
        [t("status.hookMessages.export.within30"), expiringDocs.thirtyDays],
        [t("status.hookMessages.export.within60"), expiringDocs.sixtyDays],
        [t("status.hookMessages.export.within90"), expiringDocs.ninetyDays],
      ];
      const wsExpiringDocs = XLSX.utils.aoa_to_sheet(expiringDocsData);
      XLSX.utils.book_append_sheet(wb, wsExpiringDocs, t("status.hookMessages.export.expiringDocsSheet"));

      // Deviation Reports
      const deviationSummary = [
        [t("status.hookMessages.export.deviationSummaryHeading"), ""],
        [t("status.hookMessages.export.totalDeviations"), deviationReports.length],
        [t("status.hookMessages.export.uniqueFlightsWithDeviations"), new Set(deviationReports.map(r => r.mission_id).filter(Boolean)).size],
        [t("status.hookMessages.export.uniquePilots"), new Set(deviationReports.map(r => r.reported_by).filter(Boolean)).size],
        [],
        [t("status.hookMessages.export.mainCategoryHeader"), t("status.hookMessages.export.countHeader")],
        ...Object.entries(deviationReports.reduce((acc: Record<string, number>, r) => {
          const root = r.category_path[0] || t("status.hookMessages.export.unknownCategory");
          acc[root] = (acc[root] || 0) + 1;
          return acc;
        }, {})).map(([name, value]) => [name, value]),
        [],
        [t("status.hookMessages.export.dateHeader"), t("status.hookMessages.export.pilotHeader"), t("status.hookMessages.export.categoryHeader"), t("status.hookMessages.export.commentHeader")],
        ...deviationReports.map(r => [
          format(new Date(r.created_at), "dd.MM.yyyy HH:mm", { locale: nb }),
          r.reporter_name || t("status.hookMessages.export.unknown"),
          r.category_path.join(" > "),
          r.comment || "",
        ]),
      ];
      const wsDeviation = XLSX.utils.aoa_to_sheet(deviationSummary);
      XLSX.utils.book_append_sheet(wb, wsDeviation, t("status.hookMessages.export.deviationSheet"));

      // Generate filename with date
      const fileName = `statistikk-rapport-${format(new Date(), "yyyy-MM-dd-HHmmss")}.xlsx`;
      
      // Convert workbook to array buffer for upload
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

      // Get user's company_id
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id, full_name")
        .eq("id", user?.id)
        .single();

      if (!profile?.company_id) {
        throw new Error(t("status.hookMessages.couldNotFetchCompanyInfo"));
      }

      // Upload to Supabase Storage
      const filePath = `${profile.company_id}/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, blob, {
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          upsert: true
        });

      if (uploadError) throw uploadError;

      // Create document entry in database
      const periodLabel = timePeriod === "month" ? t("status.page.periodMonth") : 
                         timePeriod === "quarter" ? t("status.page.periodQuarter") : t("status.page.periodYear");
      
      const { error: dbError } = await supabase
        .from('documents')
        .insert({
          tittel: `${t("status.hookMessages.export.reportTitlePrefix")} - ${periodLabel}`,
          kategori: t("status.hookMessages.export.docCategory"),
          beskrivelse: t("status.hookMessages.export.excelDescription", { date: format(new Date(), "dd.MM.yyyy 'kl.' HH:mm") }),
          fil_navn: fileName,
          fil_url: filePath,
          fil_storrelse: blob.size,
          company_id: profile.company_id,
          user_id: user?.id,
          t("status.hookMessages.export.unknown")
        });

      if (dbError) throw dbError;

      // Also download the file for the user
      XLSX.writeFile(wb, fileName);
      
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
      const sep = ";";
      const sections: string[][] = [];

      // KPI
      sections.push([t("status.hookMessages.export.kpiHeading"), ""]);
      sections.push([t("status.hookMessages.export.totalMissions"), String(kpiData.totalMissions)]);
      sections.push([t("status.hookMessages.export.completedMissions"), String(kpiData.completedMissions)]);
      sections.push([t("status.hookMessages.export.completionRate"), `${completionRate}%`]);
      sections.push([t("status.hookMessages.export.totalFlightHours"), String(kpiData.totalFlightHours)]);
      sections.push([t("status.hookMessages.export.incidentRate"), kpiData.incidentRate.toFixed(2)]);
      sections.push([t("status.hookMessages.export.activeResources"), String(kpiData.activeResources)]);
      sections.push([]);

      // Missions by Month
      sections.push([t("status.hookMessages.export.monthHeader"), t("status.hookMessages.export.missionCountHeader")]);
      missionsByMonth.forEach(item => sections.push([item.month, String(item.count)]));
      sections.push([]);

      // Missions by Status
      sections.push([t("status.hookMessages.export.statusHeader"), t("status.hookMessages.export.countHeader")]);
      missionsByStatus.forEach(item => sections.push([item.name, String(item.value)]));
      sections.push([]);

      // Missions by Risk
      sections.push([t("status.hookMessages.export.riskLevelHeader"), t("status.hookMessages.export.countHeader")]);
      missionsByRisk.forEach(item => sections.push([item.name, String(item.value)]));
      sections.push([]);

      // Incidents by Month
      sections.push([t("status.hookMessages.export.monthHeader"), t("status.hookMessages.export.incidentCountHeader")]);
      incidentsByMonth.forEach(item => sections.push([item.month, String(item.count)]));
      sections.push([]);

      // Incidents by Main Cause
      sections.push([t("status.hookMessages.export.mainCauseHeader"), t("status.hookMessages.export.countHeader")]);
      incidentsByMainCause.forEach(item => sections.push([item.name, String(item.value)]));
      sections.push([]);

      // Incidents by Contributing Cause
      sections.push([t("status.hookMessages.export.contributingCauseHeader"), t("status.hookMessages.export.countHeader")]);
      incidentsByContributingCause.forEach(item => sections.push([item.name, String(item.value)]));
      sections.push([]);

      // Incidents by Severity
      sections.push([t("status.hookMessages.export.severityHeader"), t("status.hookMessages.export.countHeader")]);
      incidentsBySeverity.forEach(item => sections.push([item.name, String(item.value)]));
      sections.push([]);

      // Drone Status
      sections.push([t("status.hookMessages.export.droneStatusSheet"), t("status.hookMessages.export.countHeader")]);
      droneStatus.forEach(item => sections.push([item.name, String(item.value)]));
      sections.push([]);

      // Equipment Status
      sections.push([t("status.hookMessages.export.equipmentStatusSheet"), t("status.hookMessages.export.countHeader")]);
      equipmentStatus.forEach(item => sections.push([item.name, String(item.value)]));
      sections.push([]);

      // Flight Hours by Drone
      sections.push([t("status.hookMessages.export.droneHeader"), t("status.hookMessages.export.flightHoursHeader")]);
      flightHoursByDrone.forEach(item => sections.push([item.name, String(item.hours)]));
      sections.push([]);

      // Expiring Documents
      sections.push([t("status.hookMessages.export.expiringDocsSheet"), t("status.hookMessages.export.countHeader")]);
      sections.push([t("status.hookMessages.export.within30"), String(expiringDocs.thirtyDays)]);
      sections.push([t("status.hookMessages.export.within60"), String(expiringDocs.sixtyDays)]);
      sections.push([t("status.hookMessages.export.within90"), String(expiringDocs.ninetyDays)]);
      sections.push([]);

      // Deviation Reports
      sections.push([t("status.hookMessages.export.deviationSummaryHeading"), ""]);
      sections.push([t("status.hookMessages.export.totalDeviations"), String(deviationReports.length)]);
      sections.push([t("status.hookMessages.export.uniqueFlightsWithDeviations"), String(new Set(deviationReports.map(r => r.mission_id).filter(Boolean)).size)]);
      sections.push([t("status.hookMessages.export.uniquePilots"), String(new Set(deviationReports.map(r => r.reported_by).filter(Boolean)).size)]);
      sections.push([]);
      sections.push([t("status.hookMessages.export.mainCategoryHeader"), t("status.hookMessages.export.countHeader")]);
      Object.entries(deviationReports.reduce((acc: Record<string, number>, r) => {
        const root = r.category_path[0] || t("status.hookMessages.export.unknownCategory");
        acc[root] = (acc[root] || 0) + 1;
        return acc;
      }, {})).forEach(([name, value]) => sections.push([name, String(value)]));
      sections.push([]);
      sections.push([t("status.hookMessages.export.dateHeader"), t("status.hookMessages.export.pilotHeader"), t("status.hookMessages.export.categoryHeader"), t("status.hookMessages.export.commentHeader")]);
      deviationReports.forEach(r => sections.push([
        format(new Date(r.created_at), "dd.MM.yyyy HH:mm", { locale: nb }),
        r.reporter_name || t("status.hookMessages.export.unknown"),
        r.category_path.join(" > "),
        r.comment || "",
      ]));

      const bom = "\uFEFF";
      const csvContent = bom + sections.map(row => row.join(sep)).join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });

      const fileName = `statistikk-rapport-${format(new Date(), "yyyy-MM-dd-HHmmss")}.csv`;

      // Upload to Supabase Storage + documents table
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id, full_name")
        .eq("id", user?.id)
        .single();

      if (!profile?.company_id) throw new Error(t("status.hookMessages.couldNotFetchCompanyInfo"));

      const filePath = `${profile.company_id}/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, blob, { contentType: "text/csv", upsert: true });

      if (uploadError) throw uploadError;

      const periodLabel = timePeriod === "month" ? t("status.page.periodMonth") :
                          timePeriod === "quarter" ? t("status.page.periodQuarter") : t("status.page.periodYear");

      await supabase.from("documents").insert({
        tittel: t("status.hookMessages.export.csvTitleSuffix", { period: periodLabel }),
        kategori: t("status.hookMessages.export.docCategory"),
        beskrivelse: t("status.hookMessages.export.csvDescription", { date: format(new Date(), "dd.MM.yyyy 'kl.' HH:mm") }),
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
      // Get company name and company_id from profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id, full_name, companies(navn)")
        .eq("id", user?.id)
        .single();

      const companyName = (profile as any)?.companies?.navn || t("status.hookMessages.unknownCompany");
      const companyId = profile?.company_id;
      
      if (!companyId) {
        throw new Error(t("status.hookMessages.couldNotFetchCompanyInfo"));
      }

      const periodLabel = timePeriod === "month" ? t("status.page.periodMonth") : 
                         timePeriod === "quarter" ? t("status.page.periodQuarter") : t("status.page.periodYear");

      // Create PDF document
      const doc = await createPdfDocument();
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      let yPos = 20;

      // Color palette
      const COLORS = {
        primary: [59, 130, 246] as [number, number, number],
        success: [34, 197, 94] as [number, number, number],
        warning: [234, 179, 8] as [number, number, number],
        destructive: [239, 68, 68] as [number, number, number],
        muted: [156, 163, 175] as [number, number, number],
      };

      // Helper function: Draw bar chart
      const drawBarChart = (data: { name: string; value: number }[], x: number, y: number, width: number, height: number, title: string) => {
        doc.setFontSize(12);
        setFontStyle(doc, 'bold');
        doc.text(title, x, y);
        y += 8;

        if (data.length === 0 || data.every(d => d.value === 0)) {
          doc.setFontSize(10);
          setFontStyle(doc, 'normal');
          doc.text(t("status.hookMessages.pdf.noData"), x, y + 20);
          return;
        }

        const maxValue = Math.max(...data.map(d => d.value), 1);
        const barWidth = Math.min((width - 10) / data.length - 5, 25);
        const chartHeight = height - 25;

        // Draw axes
        doc.setDrawColor(200, 200, 200);
        doc.line(x, y + chartHeight, x + width, y + chartHeight); // X-axis
        doc.line(x, y, x, y + chartHeight); // Y-axis

        // Draw bars
        data.forEach((item, index) => {
          const barHeight = (item.value / maxValue) * chartHeight;
          const barX = x + 5 + index * (barWidth + 5);
          const barY = y + chartHeight - barHeight;

          doc.setFillColor(...COLORS.primary);
          doc.rect(barX, barY, barWidth, barHeight, 'F');

          // Value label on top
          doc.setFontSize(8);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(0, 0, 0);
          doc.text(item.value.toString(), barX + barWidth / 2, barY - 2, { align: 'center' });

          // Name label below
          doc.setFont('helvetica', 'normal');
          doc.text(item.name, barX + barWidth / 2, y + chartHeight + 5, { 
            align: 'center', 
            maxWidth: barWidth + 3 
          });
        });
        
        doc.setTextColor(0, 0, 0);
      };

      // Helper function: Draw pie chart
      const drawPieChart = (data: { name: string; value: number }[], x: number, y: number, radius: number, title: string) => {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(title, x - radius, y - radius - 5);

        const total = data.reduce((sum, item) => sum + item.value, 0);
        if (total === 0) {
          doc.setFontSize(10);
          doc.setFont('helvetica', 'normal');
          doc.text(t("status.hookMessages.pdf.noData"), x, y, { align: 'center' });
          return;
        }

        const colors = [COLORS.primary, COLORS.success, COLORS.warning, COLORS.destructive, COLORS.muted];
        let currentAngle = -90; // Start at top

        // Draw each slice
        data.forEach((item, index) => {
          const sliceAngle = (item.value / total) * 360;
          const color = colors[index % colors.length];
          const startAngle = (currentAngle * Math.PI) / 180;
          const endAngle = ((currentAngle + sliceAngle) * Math.PI) / 180;
          
          doc.setFillColor(...color);
          
          // Draw slice as filled path
          doc.setDrawColor(...color);
          const segments = Math.max(2, Math.ceil(sliceAngle / 5));
          
          for (let i = 0; i <= segments; i++) {
            const angle = startAngle + (i / segments) * (endAngle - startAngle);
            const px = x + radius * Math.cos(angle);
            const py = y + radius * Math.sin(angle);
            
            if (i === 0) {
              doc.line(x, y, px, py);
            } else {
              const prevAngle = startAngle + ((i - 1) / segments) * (endAngle - startAngle);
              const prevPx = x + radius * Math.cos(prevAngle);
              const prevPy = y + radius * Math.sin(prevAngle);
              
              // Draw triangle for each segment
              doc.setFillColor(...color);
              doc.triangle(x, y, prevPx, prevPy, px, py, 'FD');
            }
          }

          // Add percentage label
          const labelAngle = currentAngle + sliceAngle / 2;
          const labelRadius = radius * 0.65;
          const labelX = x + labelRadius * Math.cos((labelAngle * Math.PI) / 180);
          const labelY = y + labelRadius * Math.sin((labelAngle * Math.PI) / 180);
          
          const percentage = ((item.value / total) * 100).toFixed(0);
          if (parseInt(percentage) >= 5) { // Only show label if slice is big enough
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(255, 255, 255);
            doc.text(`${percentage}%`, labelX, labelY + 1, { align: 'center' });
          }

          currentAngle += sliceAngle;
        });
        
        doc.setTextColor(0, 0, 0);

        // Draw legend
        let legendY = y + radius + 10;
        doc.setFont('helvetica', 'normal');
        data.forEach((item, index) => {
          const color = colors[index % colors.length];
          doc.setFillColor(...color);
          doc.rect(x - radius, legendY, 4, 4, 'F');
          doc.setFontSize(8);
          doc.text(`${item.name} (${item.value})`, x - radius + 6, legendY + 3);
          legendY += 6;
        });
      };

      // Page 1: Header and KPIs
      doc.setFontSize(20);
      setFontStyle(doc, "bold");
      doc.text(`${t("status.hookMessages.export.reportTitlePrefix")} - ${companyName}`, 20, yPos);
      yPos += 10;

      doc.setFontSize(12);
      setFontStyle(doc, "normal");
      doc.text(`${t("status.hookMessages.pdf.periodHeader")}: ${periodLabel}`, 20, yPos);
      yPos += 7;
      doc.text(`${t("status.hookMessages.pdf.generatedLabel")}: ${format(new Date(), "dd.MM.yyyy 'kl.' HH:mm", { locale: nb })}`, 20, yPos);
      yPos += 15;

      // KPI Table
      doc.setFontSize(14);
      setFontStyle(doc, "bold");
      doc.text(t("status.hookMessages.pdf.kpiTitle"), 20, yPos);
      yPos += 5;

      autoTable(doc, {
        startY: yPos,
        head: [[t("status.hookMessages.pdf.kpiHeaderLabel"), t("status.hookMessages.pdf.kpiHeaderValue")]],
        body: [
          [t("status.hookMessages.pdf.totalMissions"), kpiData.totalMissions.toString()],
          [t("status.hookMessages.pdf.completedMissions"), `${kpiData.completedMissions} (${kpiData.totalMissions > 0 ? Math.round((kpiData.completedMissions / kpiData.totalMissions) * 100) : 0}%)`],
          [t("status.hookMessages.pdf.totalFlightHours"), kpiData.totalFlightHours.toString()],
          [t("status.hookMessages.pdf.incidentRate"), `${kpiData.incidentRate.toFixed(1)}%`],
          [t("status.hookMessages.pdf.activeResources"), kpiData.activeResources.toString()],
        ],
        theme: 'grid',
        headStyles: { fillColor: COLORS.primary },
      });

      yPos = (doc as any).lastAutoTable.finalY + 15;

      // Missions by Month Bar Chart
      if (missionsByMonth.length > 0) {
        if (yPos > 200) {
          doc.addPage();
          yPos = 20;
        }
        drawBarChart(
          missionsByMonth.map(m => ({ name: m.month, value: m.count })), 
          20, 
          yPos, 
          170, 
          60, 
          t("status.hookMessages.pdf.missionsByMonth")
        );
        yPos += 70;
      }

      // Missions by Status Pie Chart
      if (missionsByStatus.length > 0) {
        if (yPos > 220) {
          doc.addPage();
          yPos = 20;
        }
        drawPieChart(missionsByStatus, 60, yPos + 35, 30, t("status.hookMessages.pdf.missionsByStatus"));
        yPos += 100;
      }

      // Page 2: Incidents
      doc.addPage();
      yPos = 20;

      doc.setFontSize(16);
      setFontStyle(doc, "bold");
      doc.text(t("status.hookMessages.pdf.incidentsHeading"), 20, yPos);
      yPos += 15;

      // Incidents by Month Bar Chart
      if (incidentsByMonth.length > 0) {
        drawBarChart(
          incidentsByMonth.map(m => ({ name: m.month, value: m.count })), 
          20, 
          yPos, 
          170, 
          60, 
          t("status.hookMessages.pdf.incidentsByMonth")
        );
        yPos += 70;
      }

      // Incidents by Main Cause Pie Chart
      if (incidentsByMainCause.length > 0) {
        if (yPos > 200) {
          doc.addPage();
          yPos = 20;
        }
        drawPieChart(incidentsByMainCause, 60, yPos + 35, 30, t("status.hookMessages.pdf.mainCauseDistribution"));
        yPos += 100;
      }

      // Incidents by Contributing Cause Table
      if (incidentsByContributingCause.length > 0) {
        if (yPos > 200) {
          doc.addPage();
          yPos = 20;
        }
        doc.setFontSize(12);
        setFontStyle(doc, 'bold');
        doc.text(t("status.hookMessages.pdf.contributingCauses"), 20, yPos);
        yPos += 5;

        autoTable(doc, {
          startY: yPos,
          head: [[t("status.hookMessages.pdf.causeHeader"), t("status.hookMessages.pdf.countHeader")]],
          body: incidentsByContributingCause.map(item => [item.name, item.value.toString()]),
          theme: 'grid',
          headStyles: { fillColor: COLORS.warning },
        });
        yPos = (doc as any).lastAutoTable.finalY + 15;
      }

      // Incidents by Severity Bar Chart
      if (incidentsBySeverity.length > 0) {
        if (yPos > 200) {
          doc.addPage();
          yPos = 20;
        }
        drawBarChart(incidentsBySeverity, 20, yPos, 170, 50, t("status.hookMessages.pdf.incidentsBySeverity"));
        yPos += 60;
      }

      // HMS Box - Days since last severe incident
      if (yPos > 240) {
        doc.addPage();
        yPos = 20;
      }
      doc.setFillColor(...COLORS.success);
      doc.rect(20, yPos, 170, 20, 'F');
      doc.setFontSize(12);
      setFontStyle(doc, "bold");
      doc.setTextColor(255, 255, 255);
      const daysText = daysSinceLastSevere > 0 
        ? t("status.hookMessages.pdf.daysSinceSevere", { days: daysSinceLastSevere })
        : t("status.hookMessages.pdf.noSevereIncidents");
      doc.text(daysText, 105, yPos + 12, { align: 'center' });
      doc.setTextColor(0, 0, 0);
      yPos += 30;

      // Page 3: Resources
      doc.addPage();
      yPos = 20;

      doc.setFontSize(16);
      setFontStyle(doc, "bold");
      doc.text(t("status.hookMessages.pdf.resourcesHeading"), 20, yPos);
      yPos += 15;

      // Drone Status Pie Chart
      if (droneStatus.length > 0) {
        drawPieChart(droneStatus, 60, yPos + 35, 30, t("status.hookMessages.pdf.droneStatus"));
        yPos += 100;
      }

      // Equipment Status Pie Chart
      if (equipmentStatus.length > 0) {
        if (yPos > 200) {
          doc.addPage();
          yPos = 20;
        }
        drawPieChart(equipmentStatus, 60, yPos + 35, 30, t("status.hookMessages.pdf.equipmentStatus"));
        yPos += 100;
      }

      // Expiring Documents
      if (yPos > 220) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(14);
      setFontStyle(doc, "bold");
      doc.text(t("status.hookMessages.pdf.expiringDocuments"), 20, yPos);
      yPos += 5;

      autoTable(doc, {
        startY: yPos,
        head: [[t("status.hookMessages.pdf.periodHeader"), t("status.hookMessages.pdf.countHeader")]],
        body: [
          [t("status.hookMessages.export.within30"), expiringDocs.thirtyDays.toString()],
          [t("status.hookMessages.export.within60"), expiringDocs.sixtyDays.toString()],
          [t("status.hookMessages.export.within90"), expiringDocs.ninetyDays.toString()],
        ],
        theme: 'grid',
        headStyles: { fillColor: COLORS.primary },
      });

      // Deviation Reports section
      if (deviationReports.length > 0) {
        doc.addPage();
        yPos = 20;
        doc.setFontSize(16);
        setFontStyle(doc, "bold");
        doc.text(t("status.hookMessages.pdf.deviationsHeading"), 20, yPos);
        yPos += 10;

        const rootCounts: Record<string, number> = {};
        deviationReports.forEach(r => {
          const root = r.category_path[0] || t("status.hookMessages.export.unknownCategory");
          rootCounts[root] = (rootCounts[root] || 0) + 1;
        });

        autoTable(doc, {
          startY: yPos,
          head: [[t("status.hookMessages.pdf.mainCategoryHeader"), t("status.hookMessages.pdf.countHeader")]],
          body: Object.entries(rootCounts).map(([k, v]) => [k, v.toString()]),
          theme: 'grid',
          headStyles: { fillColor: COLORS.warning },
        });
        yPos = (doc as any).lastAutoTable.finalY + 10;

        autoTable(doc, {
          startY: yPos,
          head: [[t("status.hookMessages.pdf.dateHeader"), t("status.hookMessages.pdf.pilotHeader"), t("status.hookMessages.pdf.categoryHeader"), t("status.hookMessages.pdf.commentHeader")]],
          body: deviationReports.map(r => [
            format(new Date(r.created_at), "dd.MM.yyyy HH:mm", { locale: nb }),
            sanitizeForPdf(r.reporter_name || t("status.hookMessages.pdf.unknown")),
            sanitizeForPdf(r.category_path.join(" > ")),
            sanitizeForPdf(r.comment || ""),
          ]),
          theme: 'striped',
          headStyles: { fillColor: COLORS.warning },
          styles: { fontSize: 8, cellPadding: 2 },
          columnStyles: { 3: { cellWidth: 60 } },
        });
      }

      // Generate PDF blob
      const pdfBlob = doc.output('blob');
      const fileName = `statistikk-rapport-${format(new Date(), "yyyy-MM-dd-HHmmss")}.pdf`;

      // Upload to Supabase Storage
      const filePath = `${companyId}/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, pdfBlob, {
          contentType: 'application/pdf',
          upsert: true
        });

      if (uploadError) throw uploadError;

      // Create document entry in database
      const { error: dbError } = await supabase
        .from('documents')
        .insert({
          tittel: `${t("status.hookMessages.export.reportTitlePrefix")} - ${periodLabel}`,
          kategori: t("status.hookMessages.export.docCategory"),
          beskrivelse: t("status.hookMessages.export.pdfDescription", { date: format(new Date(), "dd.MM.yyyy 'kl.' HH:mm") }),
          fil_navn: fileName,
          fil_url: filePath,
          fil_storrelse: pdfBlob.size,
          company_id: companyId,
          user_id: user?.id,
          t("status.hookMessages.export.unknown")
        });

      if (dbError) throw dbError;

      // Also download the file for the user
      const url = window.URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success(t("status.hookMessages.pdfSavedTitle"), {
        description: t("status.hookMessages.reportSavedDescription")
      });
    } catch (error) {
      console.error("Error exporting to PDF:", error);
      toast.error(t("status.hookMessages.exportErrorTitle"), {
        description: t("status.hookMessages.pdfExportErrorDescription")
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
            onValueChange={(v) => v && setActiveView(v as "operational" | "deviation")}
            className="justify-start"
          >
            <ToggleGroupItem value="operational" className="bg-muted text-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground border border-border">
              {t("status.page.tabIncidents")}
            </ToggleGroupItem>
            <ToggleGroupItem value="deviation" className="bg-muted text-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground border border-border">
              {t("status.page.tabDeviations")}
            </ToggleGroupItem>
          </ToggleGroup>


        {activeView === "operational" && (<>

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
                <p className="text-sm text-muted-foreground">{t("status.metrics.incidentRate")}</p>
                <p className="text-3xl font-bold text-foreground">
                  {kpiData.incidentRate.toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{t("status.metrics.perHundredHours")}</p>
              </div>
              <AlertTriangle className="w-10 h-10 text-destructive opacity-70" />
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
        </div>

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
                <Bar dataKey="value" fill={COLORS.primary} name={t("status.metrics.countLegend")} />
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

        {/* Incident Statistics */}
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

        {/* Resource & Document Overview */}
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
