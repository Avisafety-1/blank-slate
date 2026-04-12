import { useState, useEffect, useRef } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ChevronDown, Users, MapPin, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RoutePoint, SoraSettings } from "@/types/map";
import {
  computeAdjacentAreaDensity,
  calculateAdjacentRadius,
  getDensityThreshold,
  type AdjacentAreaResult,
  type ContainmentLevel,
} from "@/lib/adjacentAreaCalculator";

interface AdjacentAreaPanelProps {
  coordinates: RoutePoint[];
  soraSettings: SoraSettings;
  maxSpeedMps?: number;
  onShowAdjacentArea?: (show: boolean) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function AdjacentAreaPanel({
  coordinates,
  soraSettings,
  maxSpeedMps,
  onShowAdjacentArea,
  open: controlledOpen,
  onOpenChange,
}: AdjacentAreaPanelProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [containmentLevel, setContainmentLevel] = useState<ContainmentLevel>("low");
  const [result, setResult] = useState<AdjacentAreaResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [showOnMap, setShowOnMap] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const adjacentMountedRef = useRef(false);

  // Auto-compute when inputs change and panel is open
  useEffect(() => {
    if (!open || !soraSettings.enabled || coordinates.length < 1) {
      setResult(null);
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    computeAdjacentAreaDensity(coordinates, soraSettings, maxSpeedMps, containmentLevel, ctrl.signal)
      .then((res) => {
        if (!ctrl.signal.aborted) {
          setResult(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!ctrl.signal.aborted) {
          setResult({
            adjacentRadiusM: calculateAdjacentRadius(maxSpeedMps),
            adjacentAreaKm2: 0,
            totalPopulation: 0,
            avgDensity: 0,
            threshold: getDensityThreshold(containmentLevel),
            pass: false,
            containmentLevel,
            statusText: "Feil ved henting av data",
            error: err?.message ?? "Ukjent feil",
          });
          setLoading(false);
        }
      });

    return () => ctrl.abort();
  }, [open, coordinates, soraSettings, maxSpeedMps, containmentLevel]);

  // Only notify parent when showOnMap changes from user interaction, not on mount
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    onShowAdjacentArea?.(showOnMap);
  }, [showOnMap, onShowAdjacentArea]);

  if (!soraSettings.enabled) return null;

  const radiusKm = (calculateAdjacentRadius(maxSpeedMps) / 1000).toFixed(1);

  const contentJsx = (
    <div className="px-3 py-3 space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">
          SORA 2.5 krever vurdering av gjennomsnittlig befolkningstetthet i tilstøtende område
          (fra bakkerisikobuffer til {radiusKm} km radius).
          Beregningen bruker SSB 250m befolkningsrutenett for høyere presisjon enn kartlagets 1 km rutenett.
        </p>

        {/* Containment level selector */}
        <div className="space-y-1">
          <Label className="text-xs">Containment-nivå</Label>
          <Select
            value={containmentLevel}
            onValueChange={(v) => setContainmentLevel(v as ContainmentLevel)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low (&lt; 50 pers/km²)</SelectItem>
              <SelectItem value="low500">Low (&lt; 500 pers/km²)</SelectItem>
              <SelectItem value="low5000">Low (&lt; 5 000 pers/km²)</SelectItem>
              <SelectItem value="medium">Medium (&lt; 50 000 pers/km²)</SelectItem>
              <SelectItem value="high">High (ingen grense)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Results */}
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs">Henter SSB befolkningsdata…</span>
          </div>
        ) : result ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div className="text-muted-foreground">Tilstøtende radius</div>
              <div className="font-medium">{(result.adjacentRadiusM / 1000).toFixed(1)} km</div>

              <div className="text-muted-foreground">Areal (donut)</div>
              <div className="font-medium">{result.adjacentAreaKm2.toFixed(1)} km²</div>

              <div className="text-muted-foreground">Innbyggere funnet</div>
              <div className="font-medium">{result.totalPopulation.toLocaleString("nb-NO")}</div>

              <div className="text-muted-foreground">Gj.snitt tetthet</div>
              <div className="font-medium">{result.avgDensity.toFixed(1)} pers/km²</div>

              <div className="text-muted-foreground">Grense</div>
              <div className="font-medium">
                {result.threshold === Infinity ? "Ingen" : `${result.threshold} pers/km²`}
              </div>
            </div>

            {/* Status */}
            <div
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium",
                result.pass
                  ? "bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                  : "bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-300"
              )}
            >
              {result.pass ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0" />
              )}
              <span>{result.statusText}</span>
            </div>

            {result.error && (
              <p className="text-xs text-destructive">{result.error}</p>
            )}

          </div>
        ) : coordinates.length < 1 ? (
          <p className="text-xs text-muted-foreground italic py-2">
            Planlegg en rute for å beregne tilstøtende område.
          </p>
        ) : null}
    </div>
  );

  // Export result and loading for parent trigger badge
  const badgeJsx = result && !loading ? (
    <span className={cn(
      "ml-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
      result.pass
        ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
        : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
    )}>
      {result.pass ? "OK" : "OVER"}
    </span>
  ) : null;

  // Controlled mode: render content only
  if (controlledOpen !== undefined) {
    return open ? contentJsx : null;
  }

  // Standalone mode
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 bg-muted/60 hover:bg-muted rounded-lg text-sm font-medium transition-colors">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-blue-500" />
          <span>Tilstøtende område</span>
          {badgeJsx}
        </div>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        {contentJsx}
      </CollapsibleContent>
    </Collapsible>
  );
}
