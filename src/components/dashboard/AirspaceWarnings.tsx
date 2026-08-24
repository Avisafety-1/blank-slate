import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertTriangle, AlertCircle, Info, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import {
  fetchUnifiedZonesForRoute,
  getUnifiedCountriesForRoute,
  type UnifiedCountry,
  type UnifiedAirspaceZone,
} from "@/lib/airspaceUnified";

interface AirspaceWarningRaw {
  z_id: string;
  z_type: string;
  z_name: string;
  min_distance: number;
  route_inside: boolean;
  severity: string;
}

interface AirspaceWarning {
  zone_type: string;
  zone_name: string;
  distance_meters: number;
  is_inside: boolean;
  level: "warning" | "caution" | "note";
  message: string;
  /** Navn på rutene advarselen gjelder (kun ved flere ruter). */
  route_labels?: string[];
}

interface RoutePoint {
  lat: number;
  lng: number;
}

interface AirspaceRouteSegmentInput {
  id: string;
  label: string;
  coordinates: RoutePoint[];
}

interface AirspaceWarningsProps {
  latitude: number | null;
  longitude: number | null;
  routePoints?: RoutePoint[];
  /** Flere ruter: analysen kjøres per rute og slås sammen (worst case). */
  routeSegments?: AirspaceRouteSegmentInput[];
  cachedWarnings?: AirspaceWarning[];
  onAirspaceResult?: (warnings: AirspaceWarning[]) => void;
  showAll?: boolean;
}

export const AirspaceWarnings = ({ latitude, longitude, routePoints, routeSegments, cachedWarnings, onAirspaceResult, showAll }: AirspaceWarningsProps) => {

  const { t } = useTranslation();
  const [warnings, setWarnings] = useState<AirspaceWarning[]>([]);
  const [loading, setLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizeWarning = (warning: AirspaceWarning): AirspaceWarning => {
    if (warning.zone_type === '5KM' && warning.is_inside) {
      return { ...warning, level: 'warning' };
    }
    if (warning.zone_type === 'ATZ_5KM' && warning.is_inside) {
      return { ...warning, level: 'warning' };
    }
    return warning;
  };

  // Use cached warnings if available — skip RPC entirely
  useEffect(() => {
    if (cachedWarnings && cachedWarnings.length > 0) {
      const normalizedWarnings = cachedWarnings.map(normalizeWarning);
      setWarnings(normalizedWarnings);
      onAirspaceResult?.(normalizedWarnings);
      setLoading(false);
      return;
    }
  }, [cachedWarnings]);

  const segmentsKey = (routeSegments || [])
    .map((s) => `${s.id}:${s.label}:${s.coordinates.length}:${s.coordinates[0]?.lat ?? ''},${s.coordinates[0]?.lng ?? ''}`)
    .join("|");

  useEffect(() => {

    // Skip RPC if cached warnings are provided
    if (cachedWarnings) return;

    if (!latitude || !longitude) {
      setWarnings([]);
      return;
    }

    const checkAirspace = async () => {
      setLoading(true);
      setError(null);
      const controller = new AbortController();
      const timeoutId2 = setTimeout(() => controller.abort(), 8000);
      try {
        const multiSegments = routeSegments && routeSegments.length > 0 ? routeSegments : null;
        const runs: { label: string | null; points: RoutePoint[] | null }[] = multiSegments
          ? multiSegments.map((s) => ({
              label: multiSegments.length > 1 ? s.label : null,
              points: s.coordinates.length > 0 ? s.coordinates : null,
            }))
          : [{ label: null, points: routePoints && routePoints.length > 0 ? routePoints : null }];

        const rawWithLabel: { r: AirspaceWarningRaw; label: string | null }[] = [];
        for (const run of runs) {
          const { data, error } = await supabase.rpc("check_mission_airspace", {
            p_lat: latitude,
            p_lng: longitude,
            p_route: run.points ? JSON.parse(JSON.stringify(run.points)) : null,
          }, { signal: controller.signal } as any);

          if (error) {
            if (error.message?.includes('AbortError') || controller.signal.aborted) {
              clearTimeout(timeoutId2);
              setError("Luftromssjekk tok for lang tid. Prøv igjen.");
              return;
            }
            console.error("Error checking airspace:", error);
            continue;
          }

          for (const r of ((data as unknown as AirspaceWarningRaw[]) || [])) {
            rawWithLabel.push({ r, label: run.label });
          }
        }

        clearTimeout(timeoutId2);

        // Map raw RPC response to expected format
        const warningsArray: AirspaceWarning[] = rawWithLabel.map(({ r, label: routeLabel }) => {

          // Severity hierarchy: inside a zone is more severe, nearby is one step less
          const baseSeverity = r.severity; // WARNING, CAUTION, or INFO from DB
          const isCtrOrTiz = r.z_type === 'CTR' || r.z_type === 'TIZ';
          const is5km = r.z_type === '5KM';
          const isAtz5km = r.z_type === 'ATZ_5KM';
          let level: AirspaceWarning["level"];
          
          if (is5km && r.route_inside) {
            // Inside a 5 km RPAS/Ninox approval zone must always be a red warning.
            level = "warning";
          } else if (isAtz5km && r.route_inside) {
            // Inside a 5 km småflyplass-zone — kontakt flyplassen / PPR.
            level = "warning";
          } else if (r.route_inside) {
            // Inside: WARNING stays warning, CAUTION stays caution, INFO→caution
            level = baseSeverity === "WARNING" ? "warning" : "caution";
          } else {
            // Nearby (not inside) → downgrade one step
            level = baseSeverity === "WARNING" ? "caution" : baseSeverity === "CAUTION" ? "note" : "note";
          }
          const distMeters = Math.round(r.min_distance);
          const distStr = distMeters < 1000 ? distMeters + " m" : (distMeters / 1000).toFixed(1) + " km";
          let message: string;

          if (isCtrOrTiz) {
            message = r.route_inside
              ? t('safety.airspaceMessages.ctrTizInside', { type: r.z_type, name: r.z_name })
              : t('safety.airspaceMessages.ctrTizNear', { type: r.z_type, name: r.z_name, distance: distStr });
          } else if (is5km) {
            message = r.route_inside
              ? t('safety.airspaceMessages.fiveKmInside', { name: r.z_name })
              : t('safety.airspaceMessages.fiveKmNear', { name: r.z_name, distance: distStr });
          } else if (isAtz5km) {
            message = r.route_inside
              ? t('safety.airspaceMessages.atz5kmInside', { name: r.z_name })
              : t('safety.airspaceMessages.atz5kmNear', { name: r.z_name, distance: distStr });
          } else if (r.z_type === 'NOTAM') {
            const cleanName = (r.z_name || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            message = r.route_inside
              ? t('safety.airspaceMessages.notamInside', { name: cleanName })
              : t('safety.airspaceMessages.notamNear', { name: cleanName, distance: distStr });
          } else if (r.z_type === 'NATURVERN') {
            message = r.route_inside
              ? t('safety.airspaceMessages.natureInside', { name: r.z_name })
              : t('safety.airspaceMessages.natureNear', { name: r.z_name, distance: distStr });
          } else if (r.z_type === 'FERDSELSFORBUD') {
            message = r.route_inside
              ? t('safety.airspaceMessages.ferdselInside', { name: r.z_name })
              : t('safety.airspaceMessages.ferdselNear', { name: r.z_name, distance: distStr });
          } else if (r.z_type === 'LANDINGSFORBUD') {
            message = r.route_inside
              ? t('safety.airspaceMessages.landingInside', { name: r.z_name })
              : t('safety.airspaceMessages.landingNear', { name: r.z_name, distance: distStr });
          } else if (r.z_type === 'LAVFLYVING') {
            message = r.route_inside
              ? t('safety.airspaceMessages.lowflyInside', { name: r.z_name })
              : t('safety.airspaceMessages.lowflyNear', { name: r.z_name, distance: distStr });
          } else if (r.route_inside) {
            message = t('safety.airspaceMessages.genericInside', { type: r.z_type, name: r.z_name });
          } else {
            message = t('safety.airspaceMessages.genericNear', { type: r.z_type, name: r.z_name, distance: distStr });
          }


          return {
            zone_type: r.z_type,
            zone_name: r.z_name,
            distance_meters: distMeters,
            is_inside: r.route_inside,
            level,
            message,
            route_labels: routeLabel ? [routeLabel] : undefined,
          };
        });

        const severityOrder = { warning: 0, caution: 1, note: 2 };

        // Additive unified fetch (DK/SE/DE/FI). Fail-closed for all users
        // except those in `airspace_unified_company_allowlist` — returns []
        // otherwise, so this does not affect existing behavior.
        let unifiedWarnings: AirspaceWarning[] = [];
        for (const run of runs) {
          const pts = run.points;
          if (!pts || pts.length < 2) continue;
          try {
            const countries: UnifiedCountry[] = getUnifiedCountriesForRoute(pts, 500);
            const results = await Promise.all(
              countries.map((c) => fetchUnifiedZonesForRoute(c, pts, 500)),
            );
            const zones: UnifiedAirspaceZone[] = results.flat();
            unifiedWarnings.push(...zones.map((z) => {
              const distMeters = Math.round(z.min_distance);
              const distStr =
                distMeters < 1000
                  ? `${distMeters} m`
                  : `${(distMeters / 1000).toFixed(1)} km`;
              const displayType = `${z.zone_type} (${z.country_code})`;
              const message = z.is_inside
                ? t("safety.airspaceMessages.genericInside", {
                    type: displayType,
                    name: z.zone_name,
                  })
                : t("safety.airspaceMessages.genericNear", {
                    type: displayType,
                    name: z.zone_name,
                    distance: distStr,
                  });
              return {
                zone_type: z.zone_type,
                zone_name: z.zone_name,
                distance_meters: distMeters,
                is_inside: z.is_inside,
                level: z.level,
                message,
                route_labels: run.label ? [run.label] : undefined,
              } as AirspaceWarning;
            }));
          } catch (err) {
            // Never let unified failures break the legacy warnings render.
            console.warn("[unified airspace] fetch failed (ignored):", err);
          }
        }

        // Worst case across all routes: same zone from several routes is merged.
        // Rutemerkelappene skal kun vise rutene som faktisk utløser den viste
        // tilstanden — er én rute inne i sonen, listes bare den (ikke rutene
        // som bare er i nærheten).
        const merged = new Map<string, AirspaceWarning>();
        for (const w of [...warningsArray, ...unifiedWarnings]) {
          const key = `${w.zone_type}|${w.zone_name}`;
          const existing = merged.get(key);
          if (!existing) {
            merged.set(key, { ...w, route_labels: w.route_labels ? [...w.route_labels] : undefined });
            continue;
          }
          const isInside = existing.is_inside || w.is_inside;
          let labels: string[];
          if (existing.is_inside === w.is_inside) {
            labels = Array.from(new Set([...(existing.route_labels || []), ...(w.route_labels || [])]));
          } else if (w.is_inside) {
            labels = [...(w.route_labels || [])];
          } else {
            labels = [...(existing.route_labels || [])];
          }
          const worse = severityOrder[w.level] < severityOrder[existing.level];
          const base = worse ? w : existing;
          merged.set(key, {
            ...base,
            is_inside: isInside,
            distance_meters: isInside
              ? (w.is_inside && existing.is_inside
                  ? Math.min(existing.distance_meters, w.distance_meters)
                  : (w.is_inside ? w.distance_meters : existing.distance_meters))
              : Math.min(existing.distance_meters, w.distance_meters),
            route_labels: labels.length > 0 ? labels : undefined,
          });
        }


        const sortedWarnings = Array.from(merged.values()).sort(
          (a, b) => severityOrder[a.level] - severityOrder[b.level]
        );

        setWarnings(sortedWarnings);

        onAirspaceResult?.(sortedWarnings);
      } catch (err: any) {
        clearTimeout(timeoutId2);
        if (err?.name === 'AbortError' || controller.signal.aborted) {
          setError(t('safety.airspaceMessages.timeoutError'));
        } else {
          console.error("Error checking airspace:", err);
          setError(t('safety.airspaceMessages.genericError'));
        }
      } finally {
        setLoading(false);
      }
    };

    // Debounce to avoid too many calls
    const timeoutId = setTimeout(checkAirspace, 500);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latitude, longitude, routePoints, segmentsKey]);


  if (!latitude || !longitude) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Sjekker luftrom...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="default" className="border-amber-500 bg-amber-500/20 text-foreground [&>svg]:text-foreground mt-3">
        <AlertCircle className="h-5 w-5" />
        <AlertTitle className="font-semibold text-foreground">Luftromssjekk feilet</AlertTitle>
        <AlertDescription className="text-sm mt-1 text-foreground">{error}</AlertDescription>
      </Alert>
    );
  }

  if (warnings.length === 0) {
    return null;
  }

  const firstWarning = warnings[0];
  const remainingWarnings = warnings.slice(1);
  const remainingCount = remainingWarnings.length;

  const renderAlert = (warning: AirspaceWarning, index: number) => {
    const isWarning = warning.level === "warning";
    const isCaution = warning.level === "caution";
    const isNote = warning.level === "note";

    return (
      <Alert
        key={index}
        variant="default"
        className={
          isWarning
            ? "border-destructive bg-destructive/20 text-foreground [&>svg]:text-foreground"
            : isCaution
            ? "border-amber-500 bg-amber-500/20 text-foreground [&>svg]:text-foreground"
            : "border-blue-500 bg-blue-500/20 text-foreground [&>svg]:text-foreground"
        }
      >
        {isWarning && <AlertTriangle className="h-5 w-5" />}
        {isCaution && <AlertCircle className="h-5 w-5" />}
        {isNote && <Info className="h-5 w-5" />}
        <AlertTitle className="font-semibold text-foreground">
          {isWarning && t('dashboard.airspaceWarnings.warning')}
          {isCaution && t('dashboard.airspaceWarnings.caution')}
          {isNote && t('dashboard.airspaceWarnings.information')}
        </AlertTitle>
        <AlertDescription className="text-sm mt-1 text-foreground">
          {warning.message}
          {warning.route_labels && warning.route_labels.length > 0 && (
            <span className="mt-1.5 flex flex-wrap gap-1">
              {warning.route_labels.map((label) => (
                <span
                  key={label}
                  className="rounded-full border border-foreground/20 bg-background/40 px-2 py-0.5 text-[11px] font-medium"
                >
                  {label}
                </span>
              ))}
            </span>
          )}
        </AlertDescription>

      </Alert>
    );
  };

  // If showAll is true, render all warnings without collapsible
  if (showAll) {
    return (
      <div className="space-y-2 mt-3">
        {warnings.map((warning, index) => renderAlert(warning, index))}
      </div>
    );
  }

  return (
    <div className="space-y-2 mt-3">
      {renderAlert(firstWarning, 0)}
      
      {remainingCount > 0 && (
        <Collapsible 
          key={`collapsible-${warnings.length}`}
          open={isExpanded} 
          onOpenChange={setIsExpanded}
        >
          <CollapsibleTrigger asChild>
            <button 
              type="button"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full py-2 cursor-pointer"
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              <span>+{remainingCount} {remainingCount === 1 ? t('dashboard.airspaceWarnings.otherWarning') : t('dashboard.airspaceWarnings.otherWarnings')}</span>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 mt-2 overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
            {remainingWarnings.map((warning, index) => renderAlert(warning, index + 1))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
};
