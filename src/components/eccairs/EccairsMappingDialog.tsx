import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { EccairsTaxonomySelect } from "./EccairsTaxonomySelect";
import { useIncidentEccairsMapping } from "@/hooks/useIncidentEccairsMapping";
import { suggestEccairsMapping, OCCURRENCE_CLASS_LABELS } from "@/lib/eccairsAutoMapping";
import { Loader2, Sparkles, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface Incident {
  id: string;
  tittel: string;
  beskrivelse: string | null;
  alvorlighetsgrad: string;
  lokasjon: string | null;
  kategori: string | null;
  company_id: string;
}

interface EccairsMappingDialogProps {
  incident: Incident;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function EccairsMappingDialog({
  incident,
  open,
  onOpenChange,
  onSaved,
}: EccairsMappingDialogProps) {
  const { mapping, isLoading, saveMapping, isSaving } = useIncidentEccairsMapping(incident.id, open);
  
  const [occurrenceClass, setOccurrenceClass] = useState<string | null>(null);
  const [phaseOfFlight, setPhaseOfFlight] = useState<string | null>(null);
  const [aircraftCategory, setAircraftCategory] = useState<string>("104"); // Default UAS
  const [headline, setHeadline] = useState("");
  const [narrative, setNarrative] = useState("");
  const [locationName, setLocationName] = useState("");

  // Load existing mapping or apply auto-suggestions
  useEffect(() => {
    if (!open) return;

    if (mapping) {
      setOccurrenceClass(mapping.occurrence_class);
      setPhaseOfFlight(mapping.phase_of_flight);
      setAircraftCategory(mapping.aircraft_category || "104");
      setHeadline(mapping.headline || "");
      setNarrative(mapping.narrative || "");
      setLocationName(mapping.location_name || "");
    } else if (!isLoading) {
      // Apply auto-suggestions for new mappings
      const suggestions = suggestEccairsMapping(incident);
      setOccurrenceClass(suggestions.occurrence_class);
      setAircraftCategory(suggestions.aircraft_category);
      setHeadline(suggestions.headline || "");
      setNarrative(suggestions.narrative || "");
      setLocationName(suggestions.location_name || "");
    }
  }, [mapping, isLoading, open, incident]);

  const handleApplySuggestions = () => {
    const suggestions = suggestEccairsMapping(incident);
    setOccurrenceClass(suggestions.occurrence_class);
    setAircraftCategory(suggestions.aircraft_category);
    setHeadline(suggestions.headline || "");
    setNarrative(suggestions.narrative || "");
    setLocationName(suggestions.location_name || "");
    toast.success("Forslag anvendt");
  };

  const handleSave = async () => {
    try {
      await saveMapping({
        incident_id: incident.id,
        company_id: incident.company_id,
        occurrence_class: occurrenceClass,
        phase_of_flight: phaseOfFlight,
        aircraft_category: aircraftCategory,
        headline: headline || null,
        narrative: narrative || null,
        location_name: locationName || null,
        event_types: null,
        latitude: null,
        longitude: null,
      });
      toast.success("Klassifisering lagret");
      onSaved?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save mapping:", error);
      toast.error("Kunne ikke lagre klassifisering");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>ECCAIRS Klassifisering</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* AviSafe data summary */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <h4 className="font-medium text-sm text-muted-foreground">AviSafe-data</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Tittel: </span>
                  <span className="font-medium">{incident.tittel}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Alvorlighet: </span>
                  <Badge variant="outline">{incident.alvorlighetsgrad}</Badge>
                  {occurrenceClass && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      → {OCCURRENCE_CLASS_LABELS[occurrenceClass] || occurrenceClass}
                    </span>
                  )}
                </div>
                {incident.kategori && (
                  <div>
                    <span className="text-muted-foreground">Kategori: </span>
                    <span>{incident.kategori}</span>
                  </div>
                )}
                {incident.lokasjon && (
                  <div>
                    <span className="text-muted-foreground">Lokasjon: </span>
                    <span>{incident.lokasjon}</span>
                  </div>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleApplySuggestions}
                className="mt-2"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Bruk automatiske forslag
              </Button>
            </div>

            {/* ECCAIRS classification fields */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground">ECCAIRS-klassifisering</h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="occurrence_class">Hendelsesklasse (VL431) *</Label>
                  <EccairsTaxonomySelect
                    valueListKey="VL431"
                    value={occurrenceClass}
                    onChange={setOccurrenceClass}
                    placeholder="Velg hendelsesklasse..."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phase_of_flight">Flyets fase (VL1072)</Label>
                  <EccairsTaxonomySelect
                    valueListKey="VL1072"
                    value={phaseOfFlight}
                    onChange={setPhaseOfFlight}
                    placeholder="Velg fase..."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="aircraft_category">Luftfartøykategori (VL17)</Label>
                  <EccairsTaxonomySelect
                    valueListKey="VL17"
                    value={aircraftCategory}
                    onChange={setAircraftCategory}
                    placeholder="Velg kategori..."
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="headline">
                  Overskrift (maks 500 tegn) 
                  <span className="text-muted-foreground ml-2 text-xs">
                    {headline.length}/500
                  </span>
                </Label>
                <Input
                  id="headline"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value.slice(0, 500))}
                  placeholder="Kort beskrivelse av hendelsen..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="narrative">Narrativ (detaljert beskrivelse)</Label>
                <Textarea
                  id="narrative"
                  value={narrative}
                  onChange={(e) => setNarrative(e.target.value)}
                  placeholder="Detaljert beskrivelse av hva som skjedde..."
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="location_name">Lokasjon</Label>
                <Input
                  id="location_name"
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  placeholder="Stedsangivelse..."
                />
              </div>
            </div>

            {!occurrenceClass && (
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm">
                <AlertTriangle className="w-4 h-4" />
                <span>Hendelsesklasse er påkrevd for ECCAIRS-eksport</span>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !occurrenceClass}>
            {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Lagre klassifisering
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
