import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Calendar } from "lucide-react";
import { CalendarSubscriptionSection } from "./CalendarSubscriptionSection";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { generateICSContent, downloadICSFile, type CalendarEventExport } from "@/lib/icsExport";
import { addDays, addMonths, addYears } from "date-fns";

interface CalendarExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type TimeRange = "30" | "90" | "365" | "all";

export function CalendarExportDialog({ open, onOpenChange }: CalendarExportDialogProps) {
  const { t } = useTranslation();
  const { companyName } = useAuth();
  const [timeRange, setTimeRange] = useState<TimeRange>("90");
  const [loading, setLoading] = useState(false);
  const [eventCount, setEventCount] = useState(0);

  useEffect(() => {
    if (open) {
      countEvents();
    }
  }, [open, timeRange]);

  const getDateRange = () => {
    const now = new Date();
    let endDate: Date | null = null;

    switch (timeRange) {
      case "30":
        endDate = addDays(now, 30);
        break;
      case "90":
        endDate = addMonths(now, 3);
        break;
      case "365":
        endDate = addYears(now, 1);
        break;
      case "all":
        endDate = null;
        break;
    }

    return { startDate: now, endDate };
  };

  const countEvents = async () => {
    const { startDate, endDate } = getDateRange();
    let count = 0;

    try {
      // Count calendar_events
      let calendarQuery = supabase
        .from("calendar_events")
        .select("id", { count: "exact", head: true })
        .gte("event_date", startDate.toISOString().split("T")[0]);
      
      if (endDate) {
        calendarQuery = calendarQuery.lte("event_date", endDate.toISOString().split("T")[0]);
      }
      
      const { count: calendarCount } = await calendarQuery;
      count += calendarCount || 0;

      // Count missions
      let missionsQuery = supabase
        .from("missions")
        .select("id", { count: "exact", head: true })
        .gte("tidspunkt", startDate.toISOString());
      
      if (endDate) {
        missionsQuery = missionsQuery.lte("tidspunkt", endDate.toISOString());
      }
      
      const { count: missionsCount } = await missionsQuery;
      count += missionsCount || 0;

      // Count documents with expiry dates
      let docsQuery = supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .not("gyldig_til", "is", null)
        .gte("gyldig_til", startDate.toISOString());
      
      if (endDate) {
        docsQuery = docsQuery.lte("gyldig_til", endDate.toISOString());
      }
      
      const { count: docsCount } = await docsQuery;
      count += docsCount || 0;

      // Count drones with inspection dates
      let dronesQuery = supabase
        .from("drones")
        .select("id", { count: "exact", head: true })
        .not("neste_inspeksjon", "is", null)
        .gte("neste_inspeksjon", startDate.toISOString());
      
      if (endDate) {
        dronesQuery = dronesQuery.lte("neste_inspeksjon", endDate.toISOString());
      }
      
      const { count: dronesCount } = await dronesQuery;
      count += dronesCount || 0;

      // Count equipment with maintenance dates
      let equipmentQuery = supabase
        .from("equipment")
        .select("id", { count: "exact", head: true })
        .not("neste_vedlikehold", "is", null)
        .gte("neste_vedlikehold", startDate.toISOString());
      
      if (endDate) {
        equipmentQuery = equipmentQuery.lte("neste_vedlikehold", endDate.toISOString());
      }
      
      const { count: equipmentCount } = await equipmentQuery;
      count += equipmentCount || 0;

      // Count accessories with maintenance dates
      let accessoriesQuery = supabase
        .from("drone_accessories")
        .select("id", { count: "exact", head: true })
        .not("neste_vedlikehold", "is", null)
        .gte("neste_vedlikehold", startDate.toISOString());
      
      if (endDate) {
        accessoriesQuery = accessoriesQuery.lte("neste_vedlikehold", endDate.toISOString());
      }
      
      const { count: accessoriesCount } = await accessoriesQuery;
      count += accessoriesCount || 0;

      setEventCount(count);
    } catch (error) {
      console.error("Error counting events:", error);
    }
  };

  const fetchEvents = async (): Promise<CalendarEventExport[]> => {
    const { startDate, endDate } = getDateRange();
    const events: CalendarEventExport[] = [];

    // Fetch calendar_events
    let calendarQuery = supabase
      .from("calendar_events")
      .select("id, title, description, event_date, event_time, type")
      .gte("event_date", startDate.toISOString().split("T")[0]);
    
    if (endDate) {
      calendarQuery = calendarQuery.lte("event_date", endDate.toISOString().split("T")[0]);
    }
    
    const { data: calendarData } = await calendarQuery;
    
    if (calendarData) {
      for (const event of calendarData) {
        const eventDate = new Date(event.event_date);
        if (event.event_time) {
          const [hours, minutes] = event.event_time.split(":");
          eventDate.setHours(parseInt(hours), parseInt(minutes));
        }
        events.push({
          id: event.id,
          title: event.title,
          description: event.description || undefined,
          startDate: eventDate,
          type: event.type,
        });
      }
    }

    // Fetch missions
    let missionsQuery = supabase
      .from("missions")
      .select("id, tittel, beskrivelse, tidspunkt, slutt_tidspunkt")
      .gte("tidspunkt", startDate.toISOString());
    
    if (endDate) {
      missionsQuery = missionsQuery.lte("tidspunkt", endDate.toISOString());
    }
    
    const { data: missionsData } = await missionsQuery;
    
    if (missionsData) {
      for (const mission of missionsData) {
        events.push({
          id: mission.id,
          title: mission.tittel,
          description: mission.beskrivelse || undefined,
          startDate: new Date(mission.tidspunkt),
          endDate: mission.slutt_tidspunkt ? new Date(mission.slutt_tidspunkt) : undefined,
          type: t("dashboard.calendarExport.typeMission"),
        });
      }
    }

    // Fetch documents with expiry dates
    let docsQuery = supabase
      .from("documents")
      .select("id, tittel, kategori, gyldig_til")
      .not("gyldig_til", "is", null)
      .gte("gyldig_til", startDate.toISOString());
    
    if (endDate) {
      docsQuery = docsQuery.lte("gyldig_til", endDate.toISOString());
    }
    
    const { data: docsData } = await docsQuery;
    
    if (docsData) {
      for (const doc of docsData) {
        events.push({
          id: doc.id,
          title: `${doc.tittel} ${t("dashboard.calendarExport.expiresSuffix")}`,
          description: t("dashboard.calendarExport.categoryLabel", { value: doc.kategori }),
          startDate: new Date(doc.gyldig_til!),
          type: t("dashboard.calendarExport.typeDocument"),
        });
      }
    }

    // Fetch drones with inspection dates
    let dronesQuery = supabase
      .from("drones")
      .select("id, modell, neste_inspeksjon")
      .not("neste_inspeksjon", "is", null)
      .gte("neste_inspeksjon", startDate.toISOString());
    
    if (endDate) {
      dronesQuery = dronesQuery.lte("neste_inspeksjon", endDate.toISOString());
    }
    
    const { data: dronesData } = await dronesQuery;
    
    if (dronesData) {
      for (const drone of dronesData) {
        events.push({
          id: drone.id,
          title: t("dashboard.calendarExport.droneInspectionTitle", { model: drone.modell }),
          description: t("dashboard.calendarExport.droneInspectionDesc"),
          startDate: new Date(drone.neste_inspeksjon!),
          type: t("dashboard.calendarExport.typeMaintenance"),
        });
      }
    }

    // Fetch equipment with maintenance dates
    let equipmentQuery = supabase
      .from("equipment")
      .select("id, navn, neste_vedlikehold")
      .not("neste_vedlikehold", "is", null)
      .gte("neste_vedlikehold", startDate.toISOString());
    
    if (endDate) {
      equipmentQuery = equipmentQuery.lte("neste_vedlikehold", endDate.toISOString());
    }
    
    const { data: equipmentData } = await equipmentQuery;
    
    if (equipmentData) {
      for (const eq of equipmentData) {
        events.push({
          id: eq.id,
          title: t("dashboard.calendarExport.equipmentMaintTitle", { name: eq.navn }),
          description: t("dashboard.calendarExport.equipmentMaintDesc"),
          startDate: new Date(eq.neste_vedlikehold!),
          type: t("dashboard.calendarExport.typeMaintenance"),
        });
      }
    }

    // Fetch accessories with maintenance dates
    let accessoriesQuery = supabase
      .from("drone_accessories")
      .select("id, navn, neste_vedlikehold")
      .not("neste_vedlikehold", "is", null)
      .gte("neste_vedlikehold", startDate.toISOString());
    
    if (endDate) {
      accessoriesQuery = accessoriesQuery.lte("neste_vedlikehold", endDate.toISOString());
    }
    
    const { data: accessoriesData } = await accessoriesQuery;
    
    if (accessoriesData) {
      for (const acc of accessoriesData) {
        events.push({
          id: acc.id,
          title: t("dashboard.calendarExport.equipmentMaintTitle", { name: acc.navn }),
          description: t("dashboard.calendarExport.accessoryMaintDesc"),
          startDate: new Date(acc.neste_vedlikehold!),
          type: t("dashboard.calendarExport.typeMaintenance"),
        });
      }
    }

    return events;
  };

  const handleDownload = async () => {
    setLoading(true);
    try {
      const events = await fetchEvents();
      
      if (events.length === 0) {
        toast.info(t("dashboard.calendarExport.noEventsToExport"));
        return;
      }

      const company = companyName || "AviSafe";
      const icsContent = generateICSContent(events, company);
      const filename = `avisafe-kalender-${new Date().toISOString().split("T")[0]}.ics`;
      
      downloadICSFile(icsContent, filename);
      toast.success(t("dashboard.calendarExport.exported", { count: events.length }));
      onOpenChange(false);
    } catch (error) {
      console.error("Error exporting calendar:", error);
      toast.error(t("dashboard.calendarExport.exportError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {t("dashboard.calendarExport.title")}
          </DialogTitle>
          <DialogDescription>
            {t("dashboard.calendarExport.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="time-range">{t("dashboard.calendarExport.timeRange")}</Label>
            <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
              <SelectTrigger id="time-range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">{t("dashboard.calendarExport.next30")}</SelectItem>
                <SelectItem value="90">{t("dashboard.calendarExport.next3Months")}</SelectItem>
                <SelectItem value="365">{t("dashboard.calendarExport.nextYear")}</SelectItem>
                <SelectItem value="all">{t("dashboard.calendarExport.allFuture")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">{eventCount}</strong> {t("dashboard.calendarExport.eventsWillBeExported", { count: eventCount }).replace(/^\d+\s*/, "")}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("dashboard.calendarExport.includes")}
            </p>
          </div>

          <Button 
            onClick={handleDownload} 
            disabled={loading || eventCount === 0}
            className="w-full"
          >
            <Download className="mr-2 h-4 w-4" />
            {loading ? t("dashboard.calendarExport.generating") : t("dashboard.calendarExport.download")}
          </Button>

          <CalendarSubscriptionSection />
        </div>
      </DialogContent>
    </Dialog>
  );
}
