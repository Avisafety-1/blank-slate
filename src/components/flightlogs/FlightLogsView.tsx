import { useState } from "react";
import { GlassCard } from "@/components/GlassCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Loader2, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useFlightLogsList, DEFAULT_FLIGHT_LOG_FILTERS, type FlightLogListItem } from "@/hooks/useFlightLogsList";
import { FlightLogCard } from "./FlightLogCard";
import { FlightAnalysisDialog } from "@/components/dashboard/FlightAnalysisDialog";
import { FLIGHT_ANALYSIS_COLUMNS, loadFlightAnalysisTrack } from "@/lib/flightAnalysisTrack";

interface Props {
  active: boolean;
}

export const FlightLogsView = ({ active }: Props) => {
  const { t } = useTranslation();
  const {
    logs, loading, loadingMore, hasMore, filters, setFilters,
    droneOptions, pilotOptions, sourceOptions, companyOptions, multiCompany, loadMore, refresh,
  } = useFlightLogsList(active);


  const [openingId, setOpeningId] = useState<string | null>(null);
  const [analysisTrack, setAnalysisTrack] = useState<any>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysisMeta, setAnalysisMeta] = useState<{ date?: string; drone?: string }>({});

  const handleOpen = async (log: FlightLogListItem) => {
    setOpeningId(log.id);
    try {
      const { data, error } = await (supabase as any)
        .from("flight_logs")
        .select(FLIGHT_ANALYSIS_COLUMNS)
        .eq("id", log.id)
        .maybeSingle();
      if (error || !data) throw error || new Error("not found");
      const track = await loadFlightAnalysisTrack(data);
      setAnalysisTrack(track);
      setAnalysisMeta({ date: log.flight_date, drone: log.droneLabel || log.drone_model || undefined });
      setAnalysisOpen(true);
    } catch (e) {
      console.error("Failed to load flight analysis:", e);
      toast.error(t("flightLogs.loadError"));
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <div className="space-y-4">
      <GlassCard className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t("flightLogs.searchPlaceholder")}
              value={filters.search}
              onChange={e => setFilters(p => ({ ...p, search: e.target.value }))}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Switch
              id="flight-logs-only-mine"
              checked={filters.onlyMine}
              onCheckedChange={v => setFilters(p => ({ ...p, onlyMine: v }))}
            />
            <Label htmlFor="flight-logs-only-mine" className="text-sm cursor-pointer">
              {t("flightLogs.onlyMine")}
            </Label>
          </div>
        </div>

        <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2 ${multiCompany ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}>
          {multiCompany && (
            <Select value={filters.companyId} onValueChange={v => setFilters(p => ({ ...p, companyId: v }))}>
              <SelectTrigger><SelectValue placeholder={t("flightLogs.allDepartments")} /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="alle">{t("flightLogs.allDepartments")}</SelectItem>
                {companyOptions.map(o => (
                  <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={filters.droneId} onValueChange={v => setFilters(p => ({ ...p, droneId: v }))}>
            <SelectTrigger><SelectValue placeholder={t("flightLogs.allDrones")} /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="alle">{t("flightLogs.allDrones")}</SelectItem>
              {droneOptions.map(o => (
                <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.pilotId} onValueChange={v => setFilters(p => ({ ...p, pilotId: v }))}>
            <SelectTrigger><SelectValue placeholder={t("flightLogs.allPilots")} /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="alle">{t("flightLogs.allPilots")}</SelectItem>
              {pilotOptions.map(o => (
                <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.source} onValueChange={v => setFilters(p => ({ ...p, source: v }))}>
            <SelectTrigger><SelectValue placeholder={t("flightLogs.allSources")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">{t("flightLogs.allSources")}</SelectItem>
              {sourceOptions.includes("dronelog") && <SelectItem value="dronelog">DJI</SelectItem>}
              {sourceOptions.includes("ardupilot") && <SelectItem value="ardupilot">ArduPilot</SelectItem>}
              {sourceOptions.includes("manual") && (
                <SelectItem value="manual">{t("flightLogs.sourceManual")}</SelectItem>
              )}
            </SelectContent>
          </Select>

          <Input
            type="date"
            value={filters.dateFrom}
            onChange={e => setFilters(p => ({ ...p, dateFrom: e.target.value }))}
            aria-label={t("flightLogs.dateFrom")}
          />
          <div className="flex gap-2">
            <Input
              type="date"
              value={filters.dateTo}
              onChange={e => setFilters(p => ({ ...p, dateTo: e.target.value }))}
              aria-label={t("flightLogs.dateTo")}
              className="flex-1"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => setFilters(DEFAULT_FLIGHT_LOG_FILTERS)}
              title={t("flightLogs.resetFilters")}
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </GlassCard>

      {loading ? (
        <GlassCard className="p-8 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </GlassCard>
      ) : logs.length === 0 ? (
        <GlassCard className="p-8 text-center">
          <p className="text-muted-foreground">{t("flightLogs.empty")}</p>
        </GlassCard>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {logs.map(log => (
              <FlightLogCard key={log.id} log={log} onOpen={handleOpen} opening={openingId === log.id} />
            ))}
          </div>
          {hasMore && (
            <div className="flex justify-center py-2">
              <Button variant="outline" onClick={loadMore} disabled={loadingMore} className="gap-2">
                {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("flightLogs.loadMore")}
              </Button>
            </div>
          )}
        </>
      )}

      <FlightAnalysisDialog
        open={analysisOpen}
        onOpenChange={setAnalysisOpen}
        flightTrack={analysisTrack}
        flightDate={analysisMeta.date}
        droneName={analysisMeta.drone}
        onReassigned={refresh}
      />
    </div>
  );
};
