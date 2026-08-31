import { useState } from "react";
import { useTranslation } from "react-i18next";
import { GlassCard } from "@/components/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Plane,
  ExternalLink,
  MapPin,
  MessageSquare,
  Package,
  Pencil,
  Send,
  ShieldAlert,
  Timer,
  User,
  Users,
} from "lucide-react";
import { format } from "date-fns";
import { nb, enUS } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { translateDeviationCategory } from "@/lib/i18nHelpers";
import { DeviationCommentThread } from "./DeviationCommentThread";
import type { DeviationReport, DeviationStatus } from "@/hooks/useDeviationReports";

interface Props {
  report: DeviationReport;
  highlighted?: boolean;
  onEdit: (r: DeviationReport) => void;
  onMessage: (r: DeviationReport) => void;
  onRequestIncident: (r: DeviationReport) => void;
  onCreateIncident: (r: DeviationReport) => void;
  onOpenMission: (missionId: string) => void;
  onStatusChange?: (r: DeviationReport, status: DeviationStatus) => void;
}

const statusStyles: Record<DeviationStatus, string> = {
  new: "bg-destructive/15 text-black border-destructive/30",
  in_progress: "bg-warning/15 text-black border-warning/30",
  closed: "bg-success/15 text-black border-success/30",
};

const scoreTone = (score: number | null) => {
  if (score === null) return "bg-muted text-muted-foreground border-border";
  if (score >= 70) return "bg-destructive/20 text-foreground border-destructive/40";
  if (score >= 40) return "bg-warning/20 text-foreground border-warning/40";
  return "bg-success/20 text-foreground border-success/40";
};

export const DeviationCard = ({
  report,
  highlighted,
  onEdit,
  onMessage,
  onRequestIncident,
  onCreateIncident,
  onOpenMission,
  onStatusChange,
}: Props) => {
  const { t, i18n } = useTranslation();
  const { canBeIncidentResponsible } = useAuth() as any;
  const canChangeStatus = !!canBeIncidentResponsible;
  const dateLocale = i18n.language === "en" ? enUS : nb;
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(report.comment_count);

  const mission = report.mission;
  const categoryMain = report.category_path?.[0];
  const categoryRest = (report.category_path || []).slice(1);

  const fmt = (v: string | null | undefined, pattern = "dd.MM.yyyy HH:mm") =>
    v ? format(new Date(v), pattern, { locale: dateLocale }) : "—";

  return (
    <GlassCard
      id={`deviation-${report.id}`}
      className={cn(
        "space-y-4 transition-all",
        highlighted && "ring-2 ring-primary shadow-primary/20",
      )}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-base break-words">
              {categoryMain ? translateDeviationCategory(categoryMain) : t("deviations.card.noCategory")}
            </h3>
            {report.flight_phase && (
              <Badge variant="outline" className="text-[11px]">
                {t(`deviations.phase.${report.flight_phase}`)}
              </Badge>
            )}
            {canChangeStatus && onStatusChange ? (
              <Select
                value={report.status}
                onValueChange={(v) => onStatusChange(report, v as DeviationStatus)}
              >
                <SelectTrigger
                  className={cn("h-7 w-auto min-w-[150px] text-[11px] px-2 py-0", statusStyles[report.status])}
                  aria-label={t("deviations.edit.status")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">{t("deviations.status.new")}</SelectItem>
                  <SelectItem value="in_progress">{t("deviations.status.in_progress")}</SelectItem>
                  <SelectItem value="closed">{t("deviations.status.closed")}</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Badge variant="outline" className={cn("text-[11px]", statusStyles[report.status])}>
                {t(`deviations.status.${report.status}`)}
              </Badge>
            )}
            {report.incident_id && (
              <Badge variant="outline" className="text-[11px] bg-primary/10 text-primary border-primary/30">
                {t("deviations.card.linkedIncident")}
              </Badge>
            )}
            {!report.incident_id && report.incident_requested_at && (
              <Badge variant="outline" className="text-[11px] bg-warning/10 text-warning border-warning/30">
                {t("deviations.card.incidentRequested")}
              </Badge>
            )}
          </div>
          {categoryRest.length > 0 && (
            <p className="text-xs text-muted-foreground break-words">
              {categoryRest.map((c) => translateDeviationCategory(c)).join(" › ")}
            </p>
          )}
        </div>

        <div className="flex flex-col sm:items-end text-xs text-muted-foreground shrink-0">
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {fmt(report.created_at)}
          </span>
          <span className="flex items-center gap-1">
            <User className="w-3 h-3" />
            {report.reporter_name || t("deviations.card.unknownPilot")}
          </span>
        </div>
      </div>

      {report.comment && (
        <p className="text-sm bg-muted/40 border border-border/50 rounded-md p-3 whitespace-pre-wrap break-words">
          {report.comment}
        </p>
      )}

      {/* Mission info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-md border border-border/50 p-3 space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
            {t("deviations.card.mission")}
          </p>
          {mission ? (
            <button
              type="button"
              onClick={() => onOpenMission(mission.id)}
              className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1.5 text-left break-words"
            >
              {mission.tittel || t("deviations.card.openMission")}
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            </button>
          ) : (
            <p className="text-sm font-medium">—</p>
          )}
          <div className="text-xs text-muted-foreground space-y-1">
            {mission?.lokasjon && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {mission.lokasjon}
              </span>
            )}
            {mission?.tidspunkt && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {fmt(mission.tidspunkt)}
              </span>
            )}
            {mission?.approver_name && (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                {t("deviations.card.approvedBy", { name: mission.approver_name })}
                {mission.approved_at ? ` · ${fmt(mission.approved_at, "dd.MM.yyyy")}` : ""}
              </span>
            )}
            {report.flight && (
              <span className="flex items-center gap-1">
                <Timer className="w-3 h-3" />
                {t("deviations.card.flightDuration", {
                  minutes: report.flight.flight_duration_minutes ?? 0,
                })}
                {report.flight.pilot_name ? ` · ${report.flight.pilot_name}` : ""}
              </span>
            )}
          </div>
        </div>

        <div className="rounded-md border border-border/50 p-3 space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
            {t("deviations.card.riskAssessment")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className={cn("text-[11px]", scoreTone(mission?.overall_score ?? null))}>
              {t("deviations.card.score")}: {mission?.overall_score ?? "—"}
            </Badge>
            {mission?.sail && (
              <Badge variant="outline" className="text-[11px]">
                SAIL {mission.sail}
              </Badge>
            )}
            {mission?.["risk_nivå"] && (
              <Badge variant="outline" className="text-[11px]">
                {mission["risk_nivå"]}
              </Badge>
            )}
          </div>
          {mission?.recommendation && (
            <p className="text-xs text-muted-foreground line-clamp-3 break-words">{mission.recommendation}</p>
          )}
        </div>
      </div>

      {/* Resources */}
      {(mission?.drones.length || mission?.equipment.length || mission?.personnel.length) ? (
        <div className="flex flex-wrap gap-2">
          {mission?.drones.map((d) => (
            <Badge key={`d-${d}`} variant="secondary" className="text-[11px] gap-1">
              <Plane className="w-3 h-3" />
              {d}
            </Badge>
          ))}
          {mission?.equipment.map((e) => (
            <Badge key={`e-${e}`} variant="secondary" className="text-[11px] gap-1">
              <Package className="w-3 h-3" />
              {e}
            </Badge>
          ))}
          {mission?.personnel.map((p) => (
            <Badge key={`p-${p}`} variant="secondary" className="text-[11px] gap-1">
              <Users className="w-3 h-3" />
              {p}
            </Badge>
          ))}
        </div>
      ) : null}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onEdit(report)}>
          <Pencil className="w-3.5 h-3.5" />
          {t("actions.edit")}
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onMessage(report)}>
          <Send className="w-3.5 h-3.5" />
          {t("deviations.actions.sendMessage")}
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onRequestIncident(report)}>
          <AlertTriangle className="w-3.5 h-3.5" />
          {t("deviations.actions.requestIncident")}
        </Button>
        <Button size="sm" className="gap-1.5" onClick={() => onCreateIncident(report)}>
          <ShieldAlert className="w-3.5 h-3.5" />
          {t("deviations.actions.createIncident")}
        </Button>
      </div>

      {/* Comments */}
      <Collapsible open={commentsOpen} onOpenChange={setCommentsOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1.5 px-2">
            <MessageSquare className="w-3.5 h-3.5" />
            {t("deviations.comments.title")} ({commentCount})
            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", commentsOpen && "rotate-180")} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          {commentsOpen && (
            <DeviationCommentThread
              deviationId={report.id}
              companyId={report.company_id}
              onCountChange={setCommentCount}
            />
          )}
        </CollapsibleContent>
      </Collapsible>
    </GlassCard>
  );
};
