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
import { Activity, AlertTriangle, Clock, Package, Download, CalendarIcon } from "lucide-react";
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
import * as XLSX from "xlsx";
import autoTable from "jspdf-autotable";
import { createPdfDocument, setFontStyle, sanitizeForPdf, formatDateForPdf } from "@/lib/pdfUtils";

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
  const navigate = useNavigate();
  const { user, companyId } = useAuth();
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
  const [expiringDocs, setExpiringDocs] = useState<{ thirtyDays: number; sixtyDays: number; ninetyDays: number }>({
    thirtyDays: 0,
    sixtyDays: 0,
    ninetyDays: 0,
  });

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

    setExpiringDocs({ thirtyDays: thirtyCount, sixtyDays: sixtyCount, ninetyDays: ninetyCount });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background via-background/95 to-background/90">
        <main className="container mx-auto px-4 py-8">
          <div className="text-center">Laster statistikk...</div>
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
        ["Nøkkeltall (KPI)", ""],
        ["Totale oppdrag", kpiData.totalMissions],
        ["Fullførte oppdrag", kpiData.completedMissions],
        ["Fullføringsgrad", `${completionRate}%`],
        ["Totale flyvetimer", kpiData.totalFlightHours],
        ["Hendelsesfrekvens", kpiData.incidentRate.toFixed(2)],
        ["Aktive ressurser", kpiData.activeResources],
      ];
      const wsKPI = XLSX.utils.aoa_to_sheet(kpiSheetData);
      XLSX.utils.book_append_sheet(wb, wsKPI, "KPI");

      // Missions by Month
      const missionMonthData = [
        ["Måned", "Antall oppdrag"],
        ...missionsByMonth.map(item => [item.month, item.count])
      ];
      const wsMissionsMonth = XLSX.utils.aoa_to_sheet(missionMonthData);
      XLSX.utils.book_append_sheet(wb, wsMissionsMonth, "Oppdrag per måned");

      // Missions by Status
      const missionStatusData = [
        ["Status", "Antall"],
        ...missionsByStatus.map(item => [item.name, item.value])
      ];
      const wsMissionsStatus = XLSX.utils.aoa_to_sheet(missionStatusData);
      XLSX.utils.book_append_sheet(wb, wsMissionsStatus, "Oppdrag per status");

      // Missions by Risk
      const missionRiskData = [
        ["Risikonivå", "Antall"],
        ...missionsByRisk.map(item => [item.name, item.value])
      ];
      const wsMissionsRisk = XLSX.utils.aoa_to_sheet(missionRiskData);
      XLSX.utils.book_append_sheet(wb, wsMissionsRisk, "Oppdrag per risiko");

      // Incidents by Month
      const incidentMonthData = [
        ["Måned", "Antall hendelser"],
        ...incidentsByMonth.map(item => [item.month, item.count])
      ];
      const wsIncidentsMonth = XLSX.utils.aoa_to_sheet(incidentMonthData);
      XLSX.utils.book_append_sheet(wb, wsIncidentsMonth, "Hendelser per måned");

      // Incidents by Main Cause
      const incidentMainCauseData = [
        ["Hovedårsak", "Antall"],
        ...incidentsByMainCause.map(item => [item.name, item.value])
      ];
      const wsIncidentsMainCause = XLSX.utils.aoa_to_sheet(incidentMainCauseData);
      XLSX.utils.book_append_sheet(wb, wsIncidentsMainCause, "Hovedårsaker");

      // Incidents by Contributing Cause
      const incidentContributingData = [
        ["Medvirkende årsak", "Antall"],
        ...incidentsByContributingCause.map(item => [item.name, item.value])
      ];
      const wsIncidentsContributing = XLSX.utils.aoa_to_sheet(incidentContributingData);
      XLSX.utils.book_append_sheet(wb, wsIncidentsContributing, "Medvirkende årsaker");

      // Incidents by Severity
      const incidentSeverityData = [
        ["Alvorlighetsgrad", "Antall"],
        ...incidentsBySeverity.map(item => [item.name, item.value])
      ];
      const wsIncidentsSeverity = XLSX.utils.aoa_to_sheet(incidentSeverityData);
      XLSX.utils.book_append_sheet(wb, wsIncidentsSeverity, "Hendelser per alvorlighetsgrad");

      // Drone Status
      const droneStatusData = [
        ["Status", "Antall"],
        ...droneStatus.map(item => [item.name, item.value])
      ];
      const wsDroneStatus = XLSX.utils.aoa_to_sheet(droneStatusData);
      XLSX.utils.book_append_sheet(wb, wsDroneStatus, "Dronestatus");

      // Equipment Status
      const equipmentStatusData = [
        ["Status", "Antall"],
        ...equipmentStatus.map(item => [item.name, item.value])
      ];
      const wsEquipmentStatus = XLSX.utils.aoa_to_sheet(equipmentStatusData);
      XLSX.utils.book_append_sheet(wb, wsEquipmentStatus, "Utstyrstatus");

      // Flight Hours by Drone
      const flightHoursData = [
        ["Drone", "Flyvetimer"],
        ...flightHoursByDrone.map(item => [item.name, item.hours])
      ];
      const wsFlightHours = XLSX.utils.aoa_to_sheet(flightHoursData);
      XLSX.utils.book_append_sheet(wb, wsFlightHours, "Flyvetimer per drone");

      // Expiring Documents
      const expiringDocsData = [
        ["Tidsperiode", "Antall dokumenter"],
        ["Innen 30 dager", expiringDocs.thirtyDays],
        ["Innen 60 dager", expiringDocs.sixtyDays],
        ["Innen 90 dager", expiringDocs.ninetyDays],
      ];
      const wsExpiringDocs = XLSX.utils.aoa_to_sheet(expiringDocsData);
      XLSX.utils.book_append_sheet(wb, wsExpiringDocs, "Dokumenter som utløper");

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
        throw new Error("Kunne ikke hente firmaopplysninger");
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
      const periodLabel = timePeriod === "month" ? "Siste måned" : 
                         timePeriod === "quarter" ? "Siste kvartal" : "Siste år";
      
      const { error: dbError } = await supabase
        .from('documents')
        .insert({
          tittel: `Statistikkrapport - ${periodLabel}`,
          kategori: 'Rapporter',
          beskrivelse: `Excel-rapport generert ${format(new Date(), "dd.MM.yyyy 'kl.' HH:mm")}`,
          fil_navn: fileName,
          fil_url: filePath,
          fil_storrelse: blob.size,
          company_id: profile.company_id,
          user_id: user?.id,
          opprettet_av: profile?.full_name || user?.email || 'Ukjent'
        });

      if (dbError) throw dbError;

      // Also download the file for the user
      XLSX.writeFile(wb, fileName);
      
      toast.success("Excel-rapport lagret", {
        description: "Rapporten er lagret i dokumenter under kategorien Rapporter"
      });
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      toast.error("Feil ved eksport", {
        description: "Kunne ikke generere Excel-rapport"
      });
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

      const companyName = (profile as any)?.companies?.navn || "Ukjent selskap";
      const companyId = profile?.company_id;
      
      if (!companyId) {
        throw new Error("Kunne ikke hente firmaopplysninger");
      }

      const periodLabel = timePeriod === "month" ? "Siste måned" : 
                         timePeriod === "quarter" ? "Siste kvartal" : "Siste år";

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
          doc.text("Ingen data", x, y + 20);
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
          doc.text("Ingen data", x, y, { align: 'center' });
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
      doc.text(`Statistikkrapport - ${companyName}`, 20, yPos);
      yPos += 10;

      doc.setFontSize(12);
      setFontStyle(doc, "normal");
      doc.text(`Periode: ${periodLabel}`, 20, yPos);
      yPos += 7;
      doc.text(`Generert: ${format(new Date(), "dd.MM.yyyy 'kl.' HH:mm", { locale: nb })}`, 20, yPos);
      yPos += 15;

      // KPI Table
      doc.setFontSize(14);
      setFontStyle(doc, "bold");
      doc.text("Nøkkeltall", 20, yPos);
      yPos += 5;

      autoTable(doc, {
        startY: yPos,
        head: [['KPI', 'Verdi']],
        body: [
          ['Totalt oppdrag', kpiData.totalMissions.toString()],
          ['Fullførte oppdrag', `${kpiData.completedMissions} (${kpiData.totalMissions > 0 ? Math.round((kpiData.completedMissions / kpiData.totalMissions) * 100) : 0}%)`],
          ['Totale flyvetimer', kpiData.totalFlightHours.toString()],
          ['Hendelsesfrekvens', `${kpiData.incidentRate.toFixed(1)}%`],
          ['Aktive ressurser', kpiData.activeResources.toString()],
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
          "Oppdrag per måned"
        );
        yPos += 70;
      }

      // Missions by Status Pie Chart
      if (missionsByStatus.length > 0) {
        if (yPos > 220) {
          doc.addPage();
          yPos = 20;
        }
        drawPieChart(missionsByStatus, 60, yPos + 35, 30, "Oppdrag per status");
        yPos += 100;
      }

      // Page 2: Incidents
      doc.addPage();
      yPos = 20;

      doc.setFontSize(16);
      setFontStyle(doc, "bold");
      doc.text("Hendelser", 20, yPos);
      yPos += 15;

      // Incidents by Month Bar Chart
      if (incidentsByMonth.length > 0) {
        drawBarChart(
          incidentsByMonth.map(m => ({ name: m.month, value: m.count })), 
          20, 
          yPos, 
          170, 
          60, 
          "Hendelser per måned"
        );
        yPos += 70;
      }

      // Incidents by Main Cause Pie Chart
      if (incidentsByMainCause.length > 0) {
        if (yPos > 200) {
          doc.addPage();
          yPos = 20;
        }
        drawPieChart(incidentsByMainCause, 60, yPos + 35, 30, "Fordeling hovedårsaker");
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
        doc.text("Medvirkende årsaker", 20, yPos);
        yPos += 5;

        autoTable(doc, {
          startY: yPos,
          head: [['Årsak', 'Antall']],
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
        drawBarChart(incidentsBySeverity, 20, yPos, 170, 50, "Hendelser per alvorlighetsgrad");
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
        ? `${daysSinceLastSevere} dager siden siste alvorlige hendelse`
        : 'Ingen alvorlige hendelser registrert';
      doc.text(daysText, 105, yPos + 12, { align: 'center' });
      doc.setTextColor(0, 0, 0);
      yPos += 30;

      // Page 3: Resources
      doc.addPage();
      yPos = 20;

      doc.setFontSize(16);
      setFontStyle(doc, "bold");
      doc.text("Ressurser", 20, yPos);
      yPos += 15;

      // Drone Status Pie Chart
      if (droneStatus.length > 0) {
        drawPieChart(droneStatus, 60, yPos + 35, 30, "Dronestatus");
        yPos += 100;
      }

      // Equipment Status Pie Chart
      if (equipmentStatus.length > 0) {
        if (yPos > 200) {
          doc.addPage();
          yPos = 20;
        }
        drawPieChart(equipmentStatus, 60, yPos + 35, 30, "Utstyrsstatus");
        yPos += 100;
      }

      // Expiring Documents
      if (yPos > 220) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(14);
      setFontStyle(doc, "bold");
      doc.text("Dokumenter som utløper", 20, yPos);
      yPos += 5;

      autoTable(doc, {
        startY: yPos,
        head: [['Periode', 'Antall']],
        body: [
          ['Innen 30 dager', expiringDocs.thirtyDays.toString()],
          ['Innen 60 dager', expiringDocs.sixtyDays.toString()],
          ['Innen 90 dager', expiringDocs.ninetyDays.toString()],
        ],
        theme: 'grid',
        headStyles: { fillColor: COLORS.primary },
      });

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
          tittel: `Statistikkrapport - ${periodLabel}`,
          kategori: 'Rapporter',
          beskrivelse: `PDF-rapport generert ${format(new Date(), "dd.MM.yyyy 'kl.' HH:mm")}`,
          fil_navn: fileName,
          fil_url: filePath,
          fil_storrelse: pdfBlob.size,
          company_id: companyId,
          user_id: user?.id,
          opprettet_av: profile?.full_name || user?.email || 'Ukjent'
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

      toast.success("PDF-rapport lagret", {
        description: "Rapporten er lagret i dokumenter under kategorien Rapporter"
      });
    } catch (error) {
      console.error("Error exporting to PDF:", error);
      toast.error("Feil ved eksport", {
        description: "Kunne ikke generere PDF-rapport"
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
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground">Statistikk</h1>
          <div className="flex flex-col sm:flex-row lg:flex-row items-stretch sm:items-center gap-3 w-full">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground whitespace-nowrap">Periode:</span>
              <Select value={timePeriod} onValueChange={(value: "month" | "quarter" | "year" | "custom") => setTimePeriod(value)}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Siste måned</SelectItem>
                  <SelectItem value="quarter">Siste kvartal</SelectItem>
                  <SelectItem value="year">Siste år</SelectItem>
                  <SelectItem value="custom">Egendefinert</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {timePeriod === "custom" && (
              <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium text-foreground whitespace-nowrap">Fra:</Label>
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
                        <span className="truncate">{customDateFrom ? format(customDateFrom, "dd.MM.yy") : "Velg"}</span>
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
                  <Label className="text-sm font-medium text-foreground whitespace-nowrap">Til:</Label>
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
                        <span className="truncate">{customDateTo ? format(customDateTo, "dd.MM.yy") : "Velg"}</span>
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
            
            <div className="lg:ml-auto">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="default" size="default" className="gap-2 w-full sm:w-auto">
                    <Download className="w-4 h-4" />
                    Eksporter
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[200px]">
                  <DropdownMenuItem onClick={handleExportExcel}>
                    <Download className="w-4 h-4 mr-2" />
                    Eksporter til Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportPDF}>
                    <Download className="w-4 h-4 mr-2" />
                    Eksporter til PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <GlassCard className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Totale oppdrag</p>
                <p className="text-3xl font-bold text-foreground">{kpiData.totalMissions}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {completionRate}% fullført
                </p>
              </div>
              <Activity className="w-10 h-10 text-primary opacity-70" />
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Totale flyvetimer</p>
                <p className="text-3xl font-bold text-foreground">{kpiData.totalFlightHours.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground mt-1">timer</p>
              </div>
              <Clock className="w-10 h-10 text-primary opacity-70" />
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Hendelsesfrekvens</p>
                <p className="text-3xl font-bold text-foreground">
                  {kpiData.incidentRate.toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">per 100 flyvetimer</p>
              </div>
              <AlertTriangle className="w-10 h-10 text-destructive opacity-70" />
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Aktive ressurser</p>
                <p className="text-3xl font-bold text-foreground">{kpiData.activeResources}</p>
                <p className="text-xs text-muted-foreground mt-1">droner og utstyr</p>
              </div>
              <Package className="w-10 h-10 text-primary opacity-70" />
            </div>
          </GlassCard>
        </div>

        {/* Mission Statistics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <GlassCard className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">
              Oppdrag per måned
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
                  name="Oppdrag"
                />
              </LineChart>
            </ResponsiveContainer>
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">Oppdrag per status</h2>
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
              Oppdrag per risikonivå
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
                <Bar dataKey="value" fill={COLORS.primary} name="Antall" />
              </BarChart>
            </ResponsiveContainer>
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">HMS - Sikkerhetsstatus</h2>
            <div className="flex items-center justify-center h-[300px]">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">
                  Dager siden siste alvorlige hendelse
                </p>
                <p className="text-6xl font-bold text-foreground">{daysSinceLastSevere}</p>
                <p className="text-sm text-muted-foreground mt-2">dager</p>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Incident Statistics */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <GlassCard className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">
              Hendelser per måned
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
                <Bar dataKey="count" fill={COLORS.destructive} name="Hendelser" />
              </BarChart>
            </ResponsiveContainer>
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">
              Fordeling hovedårsaker
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={incidentsByMainCause}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: ${entry.value}`}
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
                />
              </PieChart>
            </ResponsiveContainer>
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">
              Hendelser per alvorlighetsgrad
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
                <Bar dataKey="value" fill={COLORS.warning} name="Antall" />
              </BarChart>
            </ResponsiveContainer>
          </GlassCard>
        </div>

        {/* Contributing Causes - Full Width Horizontal Bar Chart */}
        <GlassCard className="p-6">
          <h2 className="text-xl font-semibold mb-4 text-foreground">
            Medvirkende årsaker
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
              <Bar dataKey="value" fill={COLORS.warning} name="Antall" />
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>

        {/* Resource & Document Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <GlassCard className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">
              Drone statusfordeling
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
              Utstyr statusfordeling
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
              Flyvetimer per drone (topp 10)
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
                <Bar dataKey="hours" fill={COLORS.primary} name="Timer" />
              </BarChart>
            </ResponsiveContainer>
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">
              Dokumenter som utløper
            </h2>
            <div className="space-y-6 pt-8">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-muted-foreground">Innen 30 dager</span>
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
                  <span className="text-sm text-muted-foreground">Innen 60 dager</span>
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
                  <span className="text-sm text-muted-foreground">Innen 90 dager</span>
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
      </main>
      </div>
    </div>
  );
};

export default Status;
