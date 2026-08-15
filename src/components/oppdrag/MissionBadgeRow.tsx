import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import {
  Brain,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileText,
  Radio as RadioIcon,
  ShieldCheck,
} from "lucide-react";
import { MissionStatusDropdown } from "@/components/dashboard/MissionStatusDropdown";
import {
  statusColors,
  getApprovalStatusColor,
  getApprovalStatusLabel,
  canSubmitForApproval,
  shouldShowApprovalBadge,
  shouldShowSoraBadge,
  getSoraBadgeColor,
  getAIRiskBadgeColor,
  getAIRiskLabel,
  formatAIRiskScore,
  getNotamBadgeColor,
} from "@/lib/oppdragHelpers";

export interface MissionBadgeRowMission {
  id: string;
  status?: string | null;
  approval_status?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  notam_text?: string | null;
  notam_submitted_at?: string | null;
  checklist_ids?: string[] | null;
  checklist_completed_ids?: string[] | null;
}

interface Props {
  mission: MissionBadgeRowMission;
  size?: "compact" | "default";
  showApproval: boolean;
  onStatusChanged: () => void;
  onSubmitForApproval?: () => void;
  aiRisk?: { recommendation: string; overall_score: unknown } | null;
  onAIRiskClick?: () => void;
  sora?: { sora_status?: string | null } | null;
  onSoraClick?: () => void;
  onChecklistClick?: () => void;
  onNotamClick?: () => void;
  has5kmZone?: boolean;
  ninoxApproved?: boolean;
  onNinoxClick?: () => void;
  className?: string;
}

export function MissionBadgeRow({
  mission,
  size = "default",
  showApproval,
  onStatusChanged,
  onSubmitForApproval,
  aiRisk,
  onAIRiskClick,
  sora,
  onSoraClick,
  onChecklistClick,
  onNotamClick,
  has5kmZone,
  ninoxApproved,
  onNinoxClick,
  className = "",
}: Props) {
  const { t } = useTranslation();
  const compact = size === "compact";
  const badgeSize = compact
    ? "text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5 whitespace-nowrap"
    : "text-xs";
  const iconSize = "h-3 w-3 mr-1";

  const approvalStatus = mission.approval_status || "not_approved";
  const approvalClickable = canSubmitForApproval(mission.approval_status) && !!onSubmitForApproval;

  const checklistIds = mission.checklist_ids || [];
  const checklistDone =
    checklistIds.length > 0 &&
    checklistIds.every((id) => mission.checklist_completed_ids?.includes(id));

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div className={`flex flex-wrap gap-1 sm:gap-2 items-center ${className}`}>
      <MissionStatusDropdown
        missionId={mission.id}
        currentStatus={mission.status as any}
        onStatusChanged={onStatusChanged}
        statusColors={statusColors}
        className={compact ? badgeSize : "text-xs"}
        latitude={mission.latitude as any}
        longitude={mission.longitude as any}
      />

      {shouldShowApprovalBadge(showApproval, mission.approval_status) && (
        <Badge
          variant="outline"
          className={`${badgeSize} ${getApprovalStatusColor(approvalStatus)} ${
            approvalClickable ? "cursor-pointer hover:opacity-80 transition-opacity" : ""
          }`}
          onClick={
            approvalClickable
              ? (e: React.MouseEvent) => {
                  stop(e);
                  onSubmitForApproval?.();
                }
              : undefined
          }
        >
          {approvalStatus === "pending_approval" && <Clock className={iconSize} />}
          {approvalStatus === "approved" && <CheckCircle2 className={iconSize} />}
          {getApprovalStatusLabel(approvalStatus, compact)}
        </Badge>
      )}

      {/* AI risk is always shown, even when no assessment exists yet */}
      <Badge
        variant="outline"
        className={`${badgeSize} ${
          aiRisk
            ? getAIRiskBadgeColor(aiRisk.recommendation)
            : "bg-gray-500/20 text-gray-900 border-gray-500/30"
        } ${onAIRiskClick ? "cursor-pointer hover:opacity-80 transition-opacity" : ""}`}
        onClick={
          onAIRiskClick
            ? (e: React.MouseEvent) => {
                stop(e);
                onAIRiskClick();
              }
            : undefined
        }
      >
        <Brain className={iconSize} />
        {aiRisk
          ? compact
            ? formatAIRiskScore(aiRisk.overall_score)
            : `${t("missionBadges.ai")}: ${getAIRiskLabel(aiRisk.recommendation)} (${formatAIRiskScore(
                aiRisk.overall_score
              )})`
          : t("missionBadges.riskNotAssessed")}
      </Badge>

      {shouldShowSoraBadge(sora) && (
        <Badge
          variant="outline"
          className={`${badgeSize} ${getSoraBadgeColor(sora?.sora_status)} ${
            onSoraClick ? "cursor-pointer hover:opacity-80 transition-opacity" : ""
          }`}
          onClick={
            onSoraClick
              ? (e: React.MouseEvent) => {
                  stop(e);
                  onSoraClick();
                }
              : undefined
          }
        >
          <FileText className={iconSize} />
          SORA: {sora?.sora_status}
        </Badge>
      )}

      {checklistIds.length > 0 && (
        <Badge
          variant="outline"
          className={`${badgeSize} ${
            checklistDone
              ? "bg-green-500/20 text-green-900 border-green-500/30"
              : "bg-gray-500/20 text-gray-700 border-gray-500/30"
          } ${onChecklistClick ? "cursor-pointer hover:opacity-80 transition-opacity" : ""}`}
          onClick={
            onChecklistClick
              ? (e: React.MouseEvent) => {
                  stop(e);
                  onChecklistClick();
                }
              : undefined
          }
        >
          <ClipboardCheck className={iconSize} />
          {compact
            ? t("missionBadges.checklist")
            : checklistDone
            ? t("missionBadges.checklistCompleted")
            : t("missionBadges.checklistExecute")}
        </Badge>
      )}

      {mission.notam_text && (
        <Badge
          variant="outline"
          className={`${badgeSize} ${getNotamBadgeColor(!!mission.notam_submitted_at)} ${
            onNotamClick ? "cursor-pointer hover:opacity-80 transition-opacity" : ""
          }`}
          onClick={
            onNotamClick
              ? (e: React.MouseEvent) => {
                  stop(e);
                  onNotamClick();
                }
              : undefined
          }
        >
          <RadioIcon className={iconSize} />
          NOTAM
        </Badge>
      )}

      {has5kmZone && (
        <Badge
          variant="outline"
          className={`${badgeSize} ${
            ninoxApproved
              ? "bg-green-500/20 text-green-900 border-green-500/30"
              : "bg-red-500/20 text-red-900 border-red-500/30"
          } ${onNinoxClick && !ninoxApproved ? "cursor-pointer hover:opacity-80 transition-opacity" : ""}`}
          onClick={
            onNinoxClick
              ? (e: React.MouseEvent) => {
                  stop(e);
                  if (!ninoxApproved) onNinoxClick();
                }
              : undefined
          }
        >
          <ShieldCheck className={iconSize} />
          {ninoxApproved ? t("missionBadges.ninoxApproved") : t("missionBadges.ninoxNotApproved")}
        </Badge>
      )}
    </div>
  );
}
