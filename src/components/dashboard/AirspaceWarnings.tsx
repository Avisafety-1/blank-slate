import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertTriangle, AlertCircle, Info, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import {
  fetchUnifiedZonesForRoute,
  type UnifiedCountry,
  type UnifiedAirspaceZone,
} from "@/lib/airspaceUnified";

// Countries covered by the unified pipeline. NO is intentionally excluded and
// remains on the legacy code path (see airspaceUnified.ts). The unified fetch
// is additionally gated per-company via `is_unified_airspace_enabled_for_me`
// (Phase C1 — Moderavdeling only), so this call is a no-op for all other users.
const UNIFIED_COUNTRIES: UnifiedCountry[] = ["DK", "SE", "DE", "FI"];

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
}

interface RoutePoint {
  lat: number;
  lng: number;
}

interface AirspaceWarningsProps {
  latitude: number | null;
  longitude: number | null;
  routePoints?: RoutePoint[];
  cachedWarnings?: AirspaceWarning[];
  onAirspaceResult?: (warnings: AirspaceWarning[]) => void;
  showAll?: boolean;
}

export const AirspaceWarnings = ({ latitude, longitude, routePoints, cachedWarnings, onAirspaceResult, showAll }: AirspaceWarningsProps) => {
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
        const { data, error } = await supabase.rpc("check_mission_airspace", {
          p_lat: latitude,
          p_lng: longitude,
          p_route: routePoints && routePoints.length > 0 ? JSON.parse(JSON.stringify(routePoints)) : null,
        }, { signal: controller.signal } as any);

        clearTimeout(timeoutId2);

        if (error) {
          if (error.message?.includes('AbortError') || controller.signal.aborted) {
            setError("Luftromssjekk tok for lang tid. Prøv igjen.");
            return;
          }
          console.error("Error checking airspace:", error);
          return;
        }

        // Map raw RPC response to expected format
        const rawArray = (data as unknown as AirspaceWarningRaw[]) || [];
        const warningsArray: AirspaceWarning[] = rawArray.map((r) => {
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
          };
        });
        const severityOrder = { warning: 0, caution: 1, note: 2 };

        // Additive unified fetch (DK/SE/DE/FI). Fail-closed for all users
        // except those in `airspace_unified_company_allowlist` — returns []
        // otherwise, so this does not affect existing behavior.
        let unifiedWarnings: AirspaceWarning[] = [];
        if (routePoints && routePoints.length >= 2) {
          try {
            const results = await Promise.all(
              UNIFIED_COUNTRIES.map((c) =>
                fetchUnifiedZonesForRoute(c, routePoints, 500),
              ),
            );
            const zones: UnifiedAirspaceZone[] = results.flat();
            unifiedWarnings = zones.map((z) => {
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
              };
            });
          } catch (err) {
            // Never let unified failures break the legacy warnings render.
            console.warn("[unified airspace] fetch failed (ignored):", err);
          }
        }

        const combined = [...warningsArray, ...unifiedWarnings];
        const sortedWarnings = combined.sort(

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
  }, [latitude, longitude, routePoints]);

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
        <AlertDescription className="text-sm mt-1 text-foreground">{warning.message}</AlertDescription>
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
