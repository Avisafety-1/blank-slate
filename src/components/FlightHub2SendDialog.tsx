import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { RouteData, SoraSettings } from "@/types/map";
import { generateDJIKMZ, type DJIExportOptions } from "@/lib/kmzExport";

interface FlightHub2SendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  route: RouteData;
  soraSettings?: SoraSettings;
  soraBufferCoordinates?: Array<{ lat: number; lng: number }>;
}

interface FH2Project {
  uuid: string;
  name: string;
}

export const FlightHub2SendDialog = ({
  open,
  onOpenChange,
  route,
  soraSettings,
  soraBufferCoordinates,
}: FlightHub2SendDialogProps) => {
  const [projects, setProjects] = useState<FH2Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [routeName, setRouteName] = useState("Avisafe Route");
  const [sendRoute, setSendRoute] = useState(true);
  const [sendAnnotation, setSendAnnotation] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);

  // Configurable DJI parameters
  const [takeOffHeight, setTakeOffHeight] = useState(20);
  const [heightMode, setHeightMode] = useState<'relativeToStartPoint' | 'EGM96'>('relativeToStartPoint');
  const [speed, setSpeed] = useState(5);
  const [turnMode, setTurnMode] = useState<'toPointAndStopWithDiscontinuityCurvature' | 'toPointAndPassWithContinuityCurvature'>('toPointAndStopWithDiscontinuityCurvature');

  useEffect(() => {
    if (open) {
      fetchProjects();
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
          toast.info("Ingen prosjekter finnes under denne organisasjonen i FlightHub 2.");
        }
      } else if (data?.code === 200401) {
        toast.error("Ugyldig eller ikke-autorisert organisasjonsnøkkel. Sjekk nøkkelen under Admin → Mitt selskap.");
      } else {
        toast.error(data?.error || data?.message || "Kunne ikke hente prosjekter fra FlightHub 2");
      }
    } catch (err: any) {
      toast.error(err?.message || "Feil ved tilkobling til FlightHub 2");
    } finally {
      setLoadingProjects(false);
    }
  };

  const generateKmzBase64 = async (): Promise<string> => {
    const flightHeight = soraSettings?.flightAltitude || 120;
    const opts: DJIExportOptions = { takeOffHeight, heightMode, speed, turnMode };
    const blob = await generateDJIKMZ(routeName || "Avisafe Route", route, flightHeight, opts);
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const buildSoraGeoJson = () => {
    if (!soraBufferCoordinates || soraBufferCoordinates.length < 3) return null;
    const coords = soraBufferCoordinates.map((c) => [c.lng, c.lat, 0]);
    if (coords.length > 0) coords.push(coords[0]);
    return {
      type: "Feature",
      properties: { color: "#FF6B35", clampToGround: true },
      geometry: { type: "Polygon", coordinates: [coords] },
    };
  };

  const handleSend = async () => {
    if (!selectedProject) { toast.error("Velg et prosjekt"); return; }
    setLoading(true);
    let routeSuccess = false;
    let annotationSuccess = false;

    try {
      if (sendRoute && route.coordinates.length >= 2) {
        const kmzBase64 = await generateKmzBase64();
        const { data, error } = await supabase.functions.invoke("flighthub2-proxy", {
          body: { action: "upload-route", projectUuid: selectedProject, kmzBase64, routeName },
        });
        if (error) throw error;
        if (data?.code === 0) {
          routeSuccess = true;
        } else {
          const detail = data?.message || data?.raw || JSON.stringify(data);
          toast.error(`Rutefil: ${detail}`);
          console.error("[FH2] finish-upload response:", data);
        }
      }

      if (sendAnnotation && soraBufferCoordinates && soraBufferCoordinates.length >= 3) {
        const geoJson = buildSoraGeoJson();
        if (geoJson) {
          const { data, error } = await supabase.functions.invoke("flighthub2-proxy", {
            body: {
              action: "create-annotation",
              projectUuid: selectedProject,
              name: `${routeName} – SORA Buffer`,
              desc: `SORA buffersone generert av Avisafe. Høyde: ${soraSettings?.flightAltitude || 120}m`,
              geoJson,
              annotationType: 2,
            },
          });
          if (error) throw error;
          if (data?.code === 0) annotationSuccess = true;
          else toast.error(`Annotasjon: ${data?.message || "Feil"}`);
        }
      }

      if (routeSuccess || annotationSuccess) {
        const parts = [];
        if (routeSuccess) parts.push("rutefil");
        if (annotationSuccess) parts.push("SORA-sone");
        toast.success(`Sendt til FlightHub 2: ${parts.join(" og ")}`);
        onOpenChange(false);
      }
    } catch (err: any) {
      toast.error(err?.message || "Feil ved sending");
    } finally {
      setLoading(false);
    }
  };

  const hasAnnotation = soraBufferCoordinates && soraBufferCoordinates.length >= 3;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Send til FlightHub 2
          </DialogTitle>
          <DialogDescription>
            Send rutefil og SORA-korridor til DJI FlightHub 2
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Project selector */}
          <div className="space-y-2">
            <Label>FlightHub 2-prosjekt</Label>
            {loadingProjects ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Henter prosjekter...
              </div>
            ) : projects.length === 0 ? (
              <p className="text-sm text-destructive">Ingen prosjekter funnet. Sjekk at organisasjonsnøkkelen er gyldig.</p>
            ) : (
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger>
                  <SelectValue placeholder="Velg prosjekt" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.uuid} value={p.uuid}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Route name */}
          <div className="space-y-2">
            <Label>Navn på rute</Label>
            <Input value={routeName} onChange={(e) => setRouteName(e.target.value)} placeholder="Skriv inn navn..." />
          </div>

          {/* DJI Flight Parameters */}
          <div className="space-y-3 rounded-md border border-border p-3">
            <p className="text-sm font-medium text-foreground">Flyparametre</p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Flyhastighet (m/s)</Label>
                <Input
                  type="number"
                  min={1}
                  max={15}
                  value={speed}
                  onChange={(e) => setSpeed(Math.max(1, Math.min(15, Number(e.target.value))))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Takeoff-høyde (m)</Label>
                <Input
                  type="number"
                  min={1.2}
                  max={1500}
                  step={0.1}
                  value={takeOffHeight}
                  onChange={(e) => setTakeOffHeight(Math.max(1.2, Math.min(1500, Number(e.target.value))))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Høydemodus</Label>
                <Select value={heightMode} onValueChange={(v) => setHeightMode(v as any)}>
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="relativeToStartPoint">Relativ til startpunkt</SelectItem>
                    <SelectItem value="EGM96">EGM96 (havnivå)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Svingmodus</Label>
                <Select value={turnMode} onValueChange={(v) => setTurnMode(v as any)}>
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="toPointAndStopWithDiscontinuityCurvature">Stopp i punkt</SelectItem>
                    <SelectItem value="toPointAndPassWithContinuityCurvature">Fly gjennom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Checkboxes */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox id="send-route" checked={sendRoute} onCheckedChange={(c) => setSendRoute(!!c)} disabled={route.coordinates.length < 2} />
              <Label htmlFor="send-route" className="text-sm cursor-pointer">Send rutefil (KMZ)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="send-annotation" checked={sendAnnotation && !!hasAnnotation} onCheckedChange={(c) => setSendAnnotation(!!c)} disabled={!hasAnnotation} />
              <Label htmlFor="send-annotation" className="text-sm cursor-pointer">
                Send SORA-korridor som kartannotasjon
                {!hasAnnotation && <span className="text-muted-foreground ml-1">(ikke tilgjengelig)</span>}
              </Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
          <Button onClick={handleSend} disabled={loading || !selectedProject || (!sendRoute && !sendAnnotation)}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
