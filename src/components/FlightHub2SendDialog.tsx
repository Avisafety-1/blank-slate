import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Upload, MapPin } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { RouteData, SoraSettings } from "@/types/map";
import JSZip from "jszip";

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
    const timestamp = new Date().toISOString();

    const placemarks = route.coordinates
      .map(
        (coord, index) => `
      <Placemark>
        <wpml:index>${index}</wpml:index>
        <wpml:executeHeight>${flightHeight}</wpml:executeHeight>
        <wpml:waypointSpeed>5</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>toPointAndStopWithDiscontinuityCurvature</wpml:waypointTurnMode>
          <wpml:waypointTurnDampingDist>0</wpml:waypointTurnDampingDist>
        </wpml:waypointTurnParam>
        <Point>
          <coordinates>${coord.lng},${coord.lat}</coordinates>
        </Point>
      </Placemark>`
      )
      .join("\n");

    const templateKml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.2">
  <Document>
    <wpml:author>Avisafe</wpml:author>
    <wpml:createTime>${timestamp}</wpml:createTime>
    <wpml:updateTime>${timestamp}</wpml:updateTime>
    <wpml:missionConfig>
      <wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
      <wpml:finishAction>goHome</wpml:finishAction>
      <wpml:exitOnRCLost>executeLostAction</wpml:exitOnRCLost>
      <wpml:executeRCLostAction>goBack</wpml:executeRCLostAction>
      <wpml:globalTransitionalSpeed>8</wpml:globalTransitionalSpeed>
      <wpml:droneInfo>
        <wpml:droneEnumValue>68</wpml:droneEnumValue>
        <wpml:droneSubEnumValue>0</wpml:droneSubEnumValue>
      </wpml:droneInfo>
    </wpml:missionConfig>
    <Folder>
      <wpml:templateId>0</wpml:templateId>
      <wpml:waylineCoordinateSysParam>
        <wpml:coordinateMode>WGS84</wpml:coordinateMode>
        <wpml:heightMode>relativeToStartPoint</wpml:heightMode>
      </wpml:waylineCoordinateSysParam>
      <wpml:autoFlightSpeed>5</wpml:autoFlightSpeed>
      ${placemarks}
    </Folder>
  </Document>
</kml>`;

    const waylineKml = templateKml; // simplified — same structure for waylines

    const zip = new JSZip();
    zip.file("wpmz/template.kml", templateKml);
    zip.file("wpmz/waylines.kml", waylineKml);

    const blob = await zip.generateAsync({ type: "arraybuffer" });
    const bytes = new Uint8Array(blob);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const buildSoraGeoJson = () => {
    if (!soraBufferCoordinates || soraBufferCoordinates.length < 3) return null;

    const coords = soraBufferCoordinates.map((c) => [c.lng, c.lat, 0]);
    // Close the polygon
    if (coords.length > 0) {
      coords.push(coords[0]);
    }

    return {
      type: "Feature",
      properties: {
        color: "#FF6B35",
        clampToGround: true,
      },
      geometry: {
        type: "Polygon",
        coordinates: [coords],
      },
    };
  };

  const handleSend = async () => {
    if (!selectedProject) {
      toast.error("Velg et prosjekt");
      return;
    }

    setLoading(true);
    let routeSuccess = false;
    let annotationSuccess = false;

    try {
      // Send route KMZ
      if (sendRoute && route.coordinates.length >= 2) {
        const kmzBase64 = await generateKmzBase64();
        const { data, error } = await supabase.functions.invoke("flighthub2-proxy", {
          body: {
            action: "upload-route",
            projectUuid: selectedProject,
            kmzBase64,
            routeName,
          },
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

      // Send SORA annotation
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
          if (data?.code === 0) {
            annotationSuccess = true;
          } else {
            toast.error(`Annotasjon: ${data?.message || "Feil"}`);
          }
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
      <DialogContent className="sm:max-w-md">
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
              <p className="text-sm text-destructive">Ingen prosjekter funnet. Sjekk at organisasjonsnøkkelen er gyldig og har riktig tilgang under Admin → Mitt selskap.</p>
            ) : (
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger>
                  <SelectValue placeholder="Velg prosjekt" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.uuid} value={p.uuid}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Route name */}
          <div className="space-y-2">
            <Label>Navn på rute</Label>
            <Input
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
              placeholder="Skriv inn navn..."
            />
          </div>

          {/* Checkboxes */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="send-route"
                checked={sendRoute}
                onCheckedChange={(c) => setSendRoute(!!c)}
                disabled={route.coordinates.length < 2}
              />
              <Label htmlFor="send-route" className="text-sm cursor-pointer">
                Send rutefil (KMZ)
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="send-annotation"
                checked={sendAnnotation && !!hasAnnotation}
                onCheckedChange={(c) => setSendAnnotation(!!c)}
                disabled={!hasAnnotation}
              />
              <Label htmlFor="send-annotation" className="text-sm cursor-pointer">
                Send SORA-korridor som kartannotasjon
                {!hasAnnotation && (
                  <span className="text-muted-foreground ml-1">(ikke tilgjengelig)</span>
                )}
              </Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button
            onClick={handleSend}
            disabled={loading || !selectedProject || (!sendRoute && !sendAnnotation)}
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
