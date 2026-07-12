import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Upload, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { RouteData, SoraSettings } from "@/types/map";
import { generateDJIKMZ, type DJIExportOptions, DJI_DRONE_MODELS, matchDjiDroneModel } from "@/lib/kmzExport";
import { bufferPolygon, computeConvexHull, mergeBufferedCorridorPolygons, normalizePolygon } from "@/lib/soraGeometry";
import { useTranslation } from "react-i18next";

interface FlightHub2SendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  route: RouteData;
  soraSettings?: SoraSettings;
  droneModelName?: string;
  pilotPosition?: { lat: number; lng: number };
  initialRouteName?: string;
}

interface FH2Project {
  uuid: string;
  name: string;
}

const SORA_ZONES = [
  { key: "flightGeo", label: "Flight Geography", color: "#3B82F6" },
  { key: "contingency", label: "Contingency Volume", color: "#F59E0B" },
  { key: "groundRisk", label: "Ground Risk Buffer", color: "#EF4444" },
] as const;

const DJI_MODEL_OPTIONS = Object.entries(DJI_DRONE_MODELS).map(([key, val]) => ({
  key,
  label: val.label,
  enumValue: val.enumValue,
  subEnumValue: val.subEnumValue,
}));

export const FlightHub2SendDialog = ({
  open,
  onOpenChange,
  route,
  soraSettings,
  droneModelName,
  pilotPosition,
  initialRouteName,
}: FlightHub2SendDialogProps) => {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<FH2Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [routeName, setRouteName] = useState(initialRouteName || "Avisafe Route");
  const [routeMode, setRouteMode] = useState<"annotation" | "kmz" | "none">("annotation");
  const [sendAnnotation, setSendAnnotation] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);

  const [takeOffHeight, setTakeOffHeight] = useState(20);
  const [heightMode, setHeightMode] = useState<'relativeToStartPoint' | 'EGM96'>('relativeToStartPoint');
  const [speed, setSpeed] = useState(5);
  const [turnMode, setTurnMode] = useState<'toPointAndStopWithDiscontinuityCurvature' | 'toPointAndPassWithContinuityCurvature'>('toPointAndStopWithDiscontinuityCurvature');

  const autoMatch = droneModelName ? matchDjiDroneModel(droneModelName) : undefined;
  const [manualDjiModel, setManualDjiModel] = useState<string>("");

  const activeDjiModel = manualDjiModel
    ? DJI_MODEL_OPTIONS.find(m => m.key === manualDjiModel)
    : autoMatch
      ? { key: '', label: autoMatch.label, enumValue: autoMatch.enumValue, subEnumValue: autoMatch.subEnumValue }
      : undefined;

  // Compute three separate SORA buffer zones internally
  const soraZones = useMemo(() => {
    if (!soraSettings?.enabled || !route.coordinates?.length) return null;
    const coords = route.coordinates.filter(
      (p: any) => p && isFinite(p.lat) && isFinite(p.lng) && !(p.lat === 0 && p.lng === 0)
    );
    if (coords.length < 1) return null;

    const refPoint = coords[0];
    const avgLat = coords.reduce((s: number, p: any) => s + p.lat, 0) / coords.length;
    const mode = soraSettings.bufferMode ?? "corridor";
    const isClosedRoute = coords.length >= 3 &&
      coords[0].lat === coords[coords.length - 1].lat &&
      coords[0].lng === coords[coords.length - 1].lng;

    const makeBuffer = (dist: number): Array<Array<{ lat: number; lng: number }>> => {
      if (dist <= 0) return [];
      if (mode === "convexHull" || isClosedRoute) {
        const hull = computeConvexHull(coords);
        const ring = bufferPolygon(hull, dist, refPoint, avgLat);
        return normalizePolygon(ring);
      }
      return mergeBufferedCorridorPolygons(coords, dist, 16, refPoint, avgLat);
    };

    const fgDist = soraSettings.flightGeographyDistance;
    const contDist = fgDist + soraSettings.contingencyDistance;
    const grDist = contDist + soraSettings.groundRiskDistance;

    const flightGeo = makeBuffer(fgDist);
    const contingency = makeBuffer(contDist);
    const groundRisk = makeBuffer(grDist);

    const zones: Array<{ key: string; label: string; color: string; polygons: Array<Array<{ lat: number; lng: number }>> }> = [];
    if (flightGeo.length > 0) zones.push({ ...SORA_ZONES[0], polygons: flightGeo });
    if (contingency.length > 0) zones.push({ ...SORA_ZONES[1], polygons: contingency });
    if (groundRisk.length > 0) zones.push({ ...SORA_ZONES[2], polygons: groundRisk });

    return zones.length > 0 ? zones : null;
  }, [route.coordinates, soraSettings]);

  useEffect(() => {
    if (open) {
      fetchProjects();
      setManualDjiModel("");
      setRouteName(initialRouteName || "Avisafe Route");
    }
  }, [open]);

  const fetchProjects = async () => {
    setLoadingProjects(true);
    try {
      const { data, error } = await supabase.functions.invoke("flighthub2-proxy", {
        body: { action: "list-projects" },
      });
      if (error) throw error;
      if (data?.code === 0 && data?.data?.list) {
        setProjects(data.data.list);
        if (data.data.list.length > 0 && !selectedProject) {
          setSelectedProject(data.data.list[0].uuid);
        }
        if (data.data.list.length === 0) {
          toast.info(t('fh2Dialog.noProjectsInOrg'));
        }
      } else if (data?.code === 200401) {
        toast.error(t('fh2Dialog.invalidOrgKey'));
      } else {
        toast.error(data?.error || data?.message || t('fh2Dialog.couldNotFetch'));
      }
    } catch (err: any) {
      toast.error(err?.message || t('fh2Dialog.connectionError'));
    } finally {
      setLoadingProjects(false);
    }
  };

  const generateKmzBase64 = async (): Promise<string> => {
    const flightHeight = soraSettings?.flightAltitude || 120;
    const opts: DJIExportOptions = {
      takeOffHeight,
      heightMode,
      speed,
      turnMode,
      droneEnumValue: activeDjiModel?.enumValue ?? 67,
      droneSubEnumValue: activeDjiModel?.subEnumValue ?? 0,
      takeOffPoint: route.coordinates.length > 0 ? route.coordinates[0] : undefined,
    };
    const blob = await generateDJIKMZ(routeName || "Avisafe Route", route, flightHeight, opts);
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const buildZoneGeoJson = (zoneCoords: Array<{ lat: number; lng: number }>, color: string) => {
    const coords = zoneCoords.map((c) => [c.lng, c.lat, 0]);
    if (coords.length > 0) coords.push(coords[0]);
    return {
      type: "Feature",
      properties: { color, clampToGround: true },
      geometry: { type: "Polygon", coordinates: [coords] },
    };
  };

  const buildRouteLineGeoJson = (coords: Array<{ lat: number; lng: number }>, color: string) => {
    const lineCoords = coords.map((c) => [c.lng, c.lat, 0]);
    return {
      type: "Feature",
      properties: { color, clampToGround: true },
      geometry: { type: "LineString", coordinates: lineCoords },
    };
  };

  const handleSend = async () => {
    if (!selectedProject) { toast.error(t('fh2Dialog.selectProjectError')); return; }
    setLoading(true);
    let routeKmzSuccess = false;
    let routeAnnotationSuccess = false;
    let annotationCount = 0;

    try {
      if (routeMode === "kmz" && route.coordinates.length >= 2) {
        const kmzBase64 = await generateKmzBase64();
        const droneEnum = activeDjiModel?.enumValue ?? 67;
        const droneSubEnum = activeDjiModel?.subEnumValue ?? 0;
        const deviceModelKey = `0-${droneEnum}-${droneSubEnum}`;
        const { data, error } = await supabase.functions.invoke("flighthub2-proxy", {
          body: { action: "upload-route", projectUuid: selectedProject, kmzBase64, routeName, deviceModelKey },
        });
        if (error) throw error;
        if (data?.code === 0) {
          routeKmzSuccess = true;
        } else {
          const detail = data?.message || data?.raw || JSON.stringify(data);
          toast.error(t('fh2Dialog.routeFileError', { detail }));
          console.error("[FH2] finish-upload response:", data);
        }
      } else if (routeMode === "annotation" && route.coordinates.length >= 2) {
        const geoJson = buildRouteLineGeoJson(route.coordinates, "#10B981");
        const { data, error } = await supabase.functions.invoke("flighthub2-proxy", {
          body: {
            action: "create-annotation",
            projectUuid: selectedProject,
            name: routeName,
            desc: t('fh2Dialog.annotationDesc'),
            geoJson,
            annotationType: 1,
          },
        });
        if (error) {
          console.error("[FH2] route annotation error:", error);
          toast.error(t('fh2Dialog.routeAnnotationError', { detail: error.message }));
        } else if (data?.code === 0) {
          routeAnnotationSuccess = true;
        } else {
          toast.error(t('fh2Dialog.routeAnnotationError', { detail: data?.message || t('fh2Dialog.genericError') }));
        }
      }

      if (sendAnnotation && soraZones) {
        for (const zone of soraZones) {
          const total = zone.polygons.length;
          for (let idx = 0; idx < total; idx++) {
            const polyCoords = zone.polygons[idx];
            const geoJson = buildZoneGeoJson(polyCoords, zone.color);
            const partLabel = total > 1 ? ` (${idx + 1}/${total})` : "";
            const { data, error } = await supabase.functions.invoke("flighthub2-proxy", {
              body: {
                action: "create-annotation",
                projectUuid: selectedProject,
                name: `${routeName} – ${zone.label}${partLabel}`,
                desc: t('fh2Dialog.zoneDescPrefix', { zone: zone.label, alt: soraSettings?.flightAltitude || 120 }),
                geoJson,
                annotationType: 2,
              },
            });
            if (error) {
              console.error(`[FH2] annotation error (${zone.label}${partLabel}):`, error);
              toast.error(t('fh2Dialog.annotationError', { zone: `${zone.label}${partLabel}`, detail: error.message }));
            } else if (data?.code === 0) {
              annotationCount++;
            } else {
              toast.error(t('fh2Dialog.annotationError', { zone: `${zone.label}${partLabel}`, detail: data?.message || t('fh2Dialog.genericError') }));
            }
          }
        }
      }

      if (routeKmzSuccess || routeAnnotationSuccess || annotationCount > 0) {
        const parts: string[] = [];
        if (routeKmzSuccess) parts.push(t('fh2Dialog.itemRouteKmz'));
        if (routeAnnotationSuccess) parts.push(t('fh2Dialog.itemRouteAnnotation'));
        if (annotationCount > 0) parts.push(t('fh2Dialog.itemSoraZones', { count: annotationCount }));
        toast.success(t('fh2Dialog.sentSummary', { items: parts.join(" + ") }));
        onOpenChange(false);
      }
    } catch (err: any) {
      toast.error(err?.message || t('fh2Dialog.sendError'));
    } finally {
      setLoading(false);
    }
  };

  const hasAnnotation = !!soraZones;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            {t('fh2Dialog.title')}
          </DialogTitle>
          <DialogDescription>
            {t('fh2Dialog.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t('fh2Dialog.project')}</Label>
            {loadingProjects ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('fh2Dialog.loadingProjects')}
              </div>
            ) : projects.length === 0 ? (
              <p className="text-sm text-destructive">{t('fh2Dialog.noProjectsFound')}</p>
            ) : (
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger>
                  <SelectValue placeholder={t('fh2Dialog.selectProject')} />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.uuid} value={p.uuid}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label>{t('fh2Dialog.routeName')}</Label>
            <Input value={routeName} onChange={(e) => setRouteName(e.target.value)} placeholder={t('fh2Dialog.routeNamePlaceholder')} />
          </div>

          <div className="space-y-2">
            <Label className="text-sm">{t('fh2Dialog.djiModel')}</Label>
            {autoMatch && !manualDjiModel ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                  <span>{t('fh2Dialog.autoDetected')}: <strong className="text-foreground">{autoMatch.label}</strong></span>
                  <span className="text-xs">({t('fh2Dialog.fromModel', { model: droneModelName })})</span>
                </div>
                <button
                  type="button"
                  className="text-xs text-primary underline"
                  onClick={() => setManualDjiModel(Object.keys(DJI_DRONE_MODELS).find(k =>
                    DJI_DRONE_MODELS[k].enumValue === autoMatch.enumValue &&
                    DJI_DRONE_MODELS[k].subEnumValue === autoMatch.subEnumValue
                  ) || Object.keys(DJI_DRONE_MODELS)[0])}
                >
                  {t('fh2Dialog.chooseManual')}
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {!droneModelName && (
                  <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>{t('fh2Dialog.noDroneSelected')}</span>
                  </div>
                )}
                {droneModelName && !autoMatch && (
                  <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>{t('fh2Dialog.couldNotMatch', { model: droneModelName })}</span>
                  </div>
                )}
                <Select value={manualDjiModel || "__default"} onValueChange={(v) => setManualDjiModel(v === "__default" ? "" : v)}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder={t('fh2Dialog.selectDjiModel')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default">{t('fh2Dialog.defaultMatrice30')}</SelectItem>
                    {DJI_MODEL_OPTIONS.map((m) => (
                      <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {autoMatch && (
                  <button
                    type="button"
                    className="text-xs text-primary underline"
                    onClick={() => setManualDjiModel("")}
                  >
                    {t('fh2Dialog.useAutoDetected')}
                  </button>
                )}
              </div>
            )}
          </div>

          {routeMode === "kmz" && (
            <div className="space-y-3 rounded-md border border-border p-3">
              <p className="text-sm font-medium text-foreground">{t('fh2Dialog.flightParams')}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t('fh2Dialog.flightSpeed')}</Label>
                  <Input type="number" min={1} max={15} value={speed} onChange={(e) => setSpeed(Math.max(1, Math.min(15, Number(e.target.value))))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('fh2Dialog.takeoffHeight')}</Label>
                  <Input type="number" min={1.2} max={1500} step={0.1} value={takeOffHeight} onChange={(e) => setTakeOffHeight(Math.max(1.2, Math.min(1500, Number(e.target.value))))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t('fh2Dialog.heightMode')}</Label>
                  <Select value={heightMode} onValueChange={(v) => setHeightMode(v as any)}>
                    <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="relativeToStartPoint">{t('fh2Dialog.heightRelative')}</SelectItem>
                      <SelectItem value="EGM96">{t('fh2Dialog.heightEgm96')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('fh2Dialog.turnMode')}</Label>
                  <Select value={turnMode} onValueChange={(v) => setTurnMode(v as any)}>
                    <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="toPointAndStopWithDiscontinuityCurvature">{t('fh2Dialog.turnStop')}</SelectItem>
                      <SelectItem value="toPointAndPassWithContinuityCurvature">{t('fh2Dialog.turnPass')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t('fh2Dialog.routeSending')}</Label>
              <RadioGroup
                value={routeMode}
                onValueChange={(v) => setRouteMode(v as "annotation" | "kmz" | "none")}
                className="space-y-2"
              >
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="annotation" id="mode-annotation" disabled={route.coordinates.length < 2} className="mt-0.5" />
                  <Label htmlFor="mode-annotation" className="text-sm cursor-pointer font-normal">
                    {t('fh2Dialog.modeAnnotation')}
                    <span className="text-muted-foreground ml-1">– {t('fh2Dialog.recommended')}</span>
                  </Label>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="kmz" id="mode-kmz" disabled={route.coordinates.length < 2} className="mt-0.5" />
                  <Label htmlFor="mode-kmz" className="text-sm cursor-pointer font-normal">
                    {t('fh2Dialog.modeKmz')}
                  </Label>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="none" id="mode-none" className="mt-0.5" />
                  <Label htmlFor="mode-none" className="text-sm cursor-pointer font-normal">
                    {t('fh2Dialog.modeNone')}
                  </Label>
                </div>
              </RadioGroup>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="send-annotation" checked={sendAnnotation && !!hasAnnotation} onCheckedChange={(c) => setSendAnnotation(!!c)} disabled={!hasAnnotation} />
              <Label htmlFor="send-annotation" className="text-sm cursor-pointer">
                {t('fh2Dialog.sendSoraAsAnnotations')}
                {hasAnnotation && <span className="text-muted-foreground ml-1">({t('fh2Dialog.zoneCount', { count: soraZones!.length })})</span>}
                {!hasAnnotation && <span className="text-muted-foreground ml-1">({t('fh2Dialog.notAvailable')})</span>}
              </Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('fh2Dialog.cancel')}</Button>
          <Button onClick={handleSend} disabled={loading || !selectedProject || (routeMode === "none" && !sendAnnotation)}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('fh2Dialog.send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
