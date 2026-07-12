import { AlertTriangle, Phone, Mail } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { useMissionMapConflicts } from "@/hooks/useMissionMapConflicts";
import type { RouteData } from "@/types/map";

interface Props {
  missionId: string;
  tidspunkt: string | null | undefined;
  sluttTidspunkt?: string | null;
  route?: RouteData | null;
  latitude?: number | null;
  longitude?: number | null;
  status?: string;
  /** Compact mode shows only the heading (used in dense lists like dashboard). */
  compact?: boolean;
}

const fmt = (iso: string | null) => {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "dd.MM HH:mm", { locale: nb });
  } catch {
    return "—";
  }
};

/**
 * Red airspace conflict warning shown on mission cards when a mission's planned
 * area overlaps another operator's published planned mission in time AND space.
 * Includes contact info so the user can coordinate directly with the conflicting operator.
 */
export const AirspaceConflictWarning = ({
  missionId,
  tidspunkt,
  sluttTidspunkt,
  route,
  latitude,
  longitude,
  status,
  compact = false,
}: Props) => {
  const { t } = useTranslation();
  // Only check active/upcoming missions
  const enabled =
    !!tidspunkt &&
    (!status || status === "Planlagt" || status === "Pågående");

  let durationHours = 2;
  if (tidspunkt && sluttTidspunkt) {
    const diff =
      (new Date(sluttTidspunkt).getTime() - new Date(tidspunkt).getTime()) /
      3600000;
    if (Number.isFinite(diff) && diff > 0) durationHours = diff;
  }

  const { conflicts } = useMissionMapConflicts({
    enabled,
    tidspunkt: tidspunkt || "",
    durationHours,
    routeData: route ?? null,
    latitude: latitude ?? null,
    longitude: longitude ?? null,
    excludeMissionId: missionId,
    windowHours: 0,
  });

  if (!conflicts.length) return null;

  const visible = conflicts.slice(0, 5);
  const extra = conflicts.length - visible.length;

  if (compact) {
    return (
      <Alert
        variant="destructive"
        className="border-destructive/60 bg-destructive/10 py-2"
      >
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle className="font-semibold text-xs sm:text-sm mb-0">
          {t('airspaceConflict.title')}
          {conflicts.length > 1 ? ` (${conflicts.length})` : ""}
        </AlertTitle>
      </Alert>
    );
  }

  return (
    <Alert
      variant="destructive"
      className="border-destructive/60 bg-destructive/10"
    >
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="font-semibold">
        {t('airspaceConflict.title')}
      </AlertTitle>
      <AlertDescription className="space-y-2 mt-2">
        <p className="text-xs">
          {conflicts.length === 1
            ? t('airspaceConflict.oneOperator')
            : t('airspaceConflict.multipleOperators', { count: conflicts.length })}{" "}
          {t('airspaceConflict.overlaps')}{" "}
          <strong>
            {t('airspaceConflict.contactPrompt')}
          </strong>
        </p>
        <ul className="space-y-1.5">
          {visible.map((c) => {
            const showContact =
              !c.anonymous_publish &&
              (c.public_contact_phone || c.public_contact_email || c.public_contact_name);
            return (
              <li
                key={c.mission_id}
                className="rounded-md border border-destructive/30 bg-background/60 p-2 text-xs text-foreground"
              >
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <span className="font-medium">
                    {c.anonymous_publish
                      ? t('airspaceConflict.anonymousMission')
                      : c.public_title || t('airspaceConflict.plannedMission')}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {(() => {
                      const startMs = new Date(c.starts_at).getTime();
                      const endMs = c.ends_at ? new Date(c.ends_at).getTime() : NaN;
                      const isFallback =
                        Number.isFinite(endMs) &&
                        Math.abs(endMs - startMs - 24 * 3600 * 1000) < 60_000;
                      return isFallback || !c.ends_at
                        ? t('airspaceConflict.unknownEnd', { start: fmt(c.starts_at) })
                        : `${fmt(c.starts_at)} – ${fmt(c.ends_at)}`;
                    })()}
                  </span>
                </div>
                {c.anonymous_publish ? (
                  <p className="text-muted-foreground mt-1">
                    {t('airspaceConflict.anonymousNote')}
                  </p>
                ) : showContact ? (
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                    {c.public_contact_name && (
                      <span className="text-muted-foreground">
                        {c.public_contact_name}
                      </span>
                    )}
                    {c.public_contact_phone && (
                      <a
                        href={`tel:${c.public_contact_phone}`}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <Phone className="h-3 w-3" />
                        {c.public_contact_phone}
                      </a>
                    )}
                    {c.public_contact_email && (
                      <a
                        href={`mailto:${c.public_contact_email}`}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <Mail className="h-3 w-3" />
                        {c.public_contact_email}
                      </a>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground mt-1">
                    {t('airspaceConflict.noContact')}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        {extra > 0 && (
          <p className="text-xs text-muted-foreground">{t('airspaceConflict.moreCount', { count: extra })}</p>
        )}
      </AlertDescription>
    </Alert>
  );
};
