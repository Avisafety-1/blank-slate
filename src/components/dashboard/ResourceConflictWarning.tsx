import { AlertTriangle, Info } from "lucide-react";
import { format } from "date-fns";
import { nb, enGB } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { ResourceConflict } from "@/hooks/useResourceConflicts";

interface ResourceConflictWarningProps {
  conflicts: ResourceConflict[];
  compact?: boolean;
}

export const ResourceConflictWarning = ({ conflicts, compact = false }: ResourceConflictWarningProps) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith("no") ? nb : enGB;

  if (conflicts.length === 0) return null;

  const overlaps = conflicts.filter((c) => c.conflictType === 'overlap');
  const sameDay = conflicts.filter((c) => c.conflictType === 'same_day');

  if (overlaps.length > 0) {
    const conflict = overlaps[0];
    const title = conflict.conflictingMission.tittel;
    const time = format(new Date(conflict.conflictingMission.tidspunkt), "dd.MM HH:mm", { locale });
    return (
      <div className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400 mt-1">
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
        <span>
          {compact
            ? t("conflicts.resource.usedInCompact", { title })
            : t("conflicts.resource.usedIn", { title, time })}
        </span>
      </div>
    );
  }

  if (sameDay.length > 0) {
    const conflict = sameDay[0];
    const title = conflict.conflictingMission.tittel;
    const time = format(new Date(conflict.conflictingMission.tidspunkt), "HH:mm", { locale });
    return (
      <div className="flex items-start gap-1.5 text-xs text-blue-600 dark:text-blue-400 mt-1">
        <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
        <span>
          {compact
            ? t("conflicts.resource.sameDayCompact", { title })
            : t("conflicts.resource.sameDay", { title, time })}
        </span>
      </div>
    );
  }

  return null;
};

// Smaller inline indicator for badges
export const ResourceConflictIndicator = ({ conflicts }: { conflicts: ResourceConflict[] }) => {
  if (conflicts.length === 0) return null;

  const hasOverlap = conflicts.some((c) => c.conflictType === 'overlap');

  if (hasOverlap) {
    return <AlertTriangle className="h-3 w-3 text-amber-500 ml-1 flex-shrink-0" />;
  }

  return <Info className="h-3 w-3 text-blue-500 ml-1 flex-shrink-0" />;
};
