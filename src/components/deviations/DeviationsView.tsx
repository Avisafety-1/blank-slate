import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RefreshCw, Search, FileWarning } from "lucide-react";
import { useDeviationReports, type DeviationReport, type DeviationStatus } from "@/hooks/useDeviationReports";
import { DeviationCard } from "./DeviationCard";
import { EditDeviationDialog } from "./EditDeviationDialog";
import { DeviationMessageDialog } from "./DeviationMessageDialog";
import { AddIncidentDialog } from "@/components/dashboard/AddIncidentDialog";
import { MissionDetailDialog } from "@/components/dashboard/MissionDetailDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { translateDeviationCategory } from "@/lib/i18nHelpers";

interface Props {
  active: boolean;
  focusDeviationId?: string | null;
}

export const DeviationsView = ({ active, focusDeviationId }: Props) => {
  const { t } = useTranslation();
  const { reports, loading, refetch } = useDeviationReports(active);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<DeviationStatus | "all">("all");
  const [editTarget, setEditTarget] = useState<DeviationReport | null>(null);
  const [messageTarget, setMessageTarget] = useState<DeviationReport | null>(null);
  const [messageMode, setMessageMode] = useState<"message" | "request_incident">("message");
  const [incidentMissionId, setIncidentMissionId] = useState<string | null>(null);
  const [missionDetail, setMissionDetail] = useState<any | null>(null);

  const openMission = async (missionId: string) => {
    const { data, error } = await supabase.from("missions").select("*").eq("id", missionId).maybeSingle();
    if (error || !data) {
      toast.error(t("deviations.card.missionNotFound"));
      return;
    }
    setMissionDetail(data);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reports.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      const haystack = [
        ...(r.category_path || []).map((c) => translateDeviationCategory(c)),
        ...(r.category_path || []),
        r.comment ?? "",
        r.reporter_name ?? "",
        r.mission?.tittel ?? "",
        r.mission?.lokasjon ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [reports, search, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("deviations.searchPlaceholder")}
            className="pl-8"
          />
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("deviations.filters.all")}</SelectItem>
              <SelectItem value="new">{t("deviations.status.new")}</SelectItem>
              <SelectItem value="in_progress">{t("deviations.status.in_progress")}</SelectItem>
              <SelectItem value="closed">{t("deviations.status.closed")}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => refetch()} aria-label={t("actions.refresh")}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          {t("common.loading")}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-2">
          <FileWarning className="w-8 h-8" />
          <p>{t("deviations.empty")}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((r) => (
            <DeviationCard
              key={r.id}
              report={r}
              highlighted={focusDeviationId === r.id}
              onEdit={setEditTarget}
              onMessage={(rep) => {
                setMessageMode("message");
                setMessageTarget(rep);
              }}
              onRequestIncident={(rep) => {
                setMessageMode("request_incident");
                setMessageTarget(rep);
              }}
              onCreateIncident={(rep) => setIncidentMissionId(rep.mission_id)}
              onOpenMission={openMission}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      )}

      <MissionDetailDialog
        open={!!missionDetail}
        onOpenChange={(o) => !o && setMissionDetail(null)}
        mission={missionDetail}
      />

      <EditDeviationDialog
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        report={editTarget}
        onSaved={refetch}
      />

      <DeviationMessageDialog
        open={!!messageTarget}
        onOpenChange={(o) => !o && setMessageTarget(null)}
        report={messageTarget}
        mode={messageMode}
        onSent={refetch}
      />

      {incidentMissionId && (
        <AddIncidentDialog
          open={!!incidentMissionId}
          onOpenChange={(o) => !o && setIncidentMissionId(null)}
          defaultMissionId={incidentMissionId}
        />
      )}
    </div>
  );
};
