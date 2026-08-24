import { useTranslation } from "react-i18next";
import { MapPin, Ruler, Route } from "lucide-react";
import { segmentsFromRouteData, routeColor } from "@/lib/routeSegments";
import type { RouteData } from "@/types/map";

interface RouteSegmentsInfoProps {
  route?: RouteData | null;
  /** Vis "PLANLAGT RUTE"-overskrift med ikon. */
  showHeader?: boolean;
  className?: string;
}

/** Viser info om alle rutene i et oppdrag (rute 1, rute 2 osv). */
export const RouteSegmentsInfo = ({ route, showHeader = true, className }: RouteSegmentsInfoProps) => {
  const { t } = useTranslation();
  const segments = segmentsFromRouteData(route ?? null).filter((s) => s.coordinates.length > 0);
  if (segments.length === 0) return null;

  const totalPoints = segments.reduce((sum, s) => sum + s.coordinates.length, 0);
  const totalDistance = segments.reduce((sum, s) => sum + (s.totalDistance || 0), 0);
  const multi = segments.length > 1;

  return (
    <div className={className}>
      {showHeader && (
        <div className="flex items-center gap-2 mb-2">
          <Route className="h-4 w-4 text-muted-foreground" />
          <p className="text-xs font-semibold text-muted-foreground">{t('pages.missions.card.plannedRouteHeader')}</p>
        </div>
      )}

      {!multi ? (
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-primary" />
            <span>{totalPoints} {t('pages.missions.card.points')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Ruler className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{totalDistance.toFixed(2)} km</span>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {segments.map((segment, index) => (
            <div key={segment.id} className="flex items-center gap-3 text-sm flex-wrap">
              <span className="flex items-center gap-1.5 min-w-[70px]">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0 border border-background"
                  style={{ backgroundColor: routeColor(index) }}
                />
                <span className="font-medium">{t('pages.missions.card.routeN', { n: index + 1 })}</span>
              </span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                {segment.coordinates.length} {t('pages.missions.card.points')}
              </span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Ruler className="h-3.5 w-3.5" />
                {(segment.totalDistance || 0).toFixed(2)} km
              </span>
            </div>
          ))}
          <p className="text-xs text-muted-foreground pt-1 border-t border-border/40">
            {t('pages.missions.card.routesTotal', {
              routes: segments.length,
              points: totalPoints,
              km: totalDistance.toFixed(2),
            })}
          </p>
        </div>
      )}
    </div>
  );
};
