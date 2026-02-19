import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronDown,
  Wind,
  Eye,
  Mountain,
  BatteryCharging,
  UserCheck,
  FileText,
  BookOpen,
  AlertTriangle,
  Loader2,
  Save,
  X,
  Info,
  Thermometer,
  Plane,
  Moon,
  Clock,
  Users,
} from "lucide-react";

interface Document {
  id: string;
  tittel: string;
  kategori: string;
  beskrivelse: string | null;
}

interface SoraConfig {
  max_wind_speed_ms: number;
  max_wind_gust_ms: number;
  max_visibility_km: number;
  max_flight_altitude_m: number;
  require_backup_battery: boolean;
  require_observer: boolean;
  min_temp_c: number;
  max_temp_c: number;
  allow_bvlos: boolean;
  allow_night_flight: boolean;
  max_pilot_inactivity_days: number | null;
  max_population_density_per_km2: number | null;
  operative_restrictions: string;
  policy_notes: string;
  linked_document_ids: string[];
}

const DEFAULT_CONFIG: SoraConfig = {
  max_wind_speed_ms: 10,
  max_wind_gust_ms: 15,
  max_visibility_km: 1,
  max_flight_altitude_m: 120,
  require_backup_battery: false,
  require_observer: false,
  min_temp_c: -10,
  max_temp_c: 40,
  allow_bvlos: false,
  allow_night_flight: false,
  max_pilot_inactivity_days: null,
  max_population_density_per_km2: null,
  operative_restrictions: "",
  policy_notes: "",
  linked_document_ids: [],
};

export const CompanySoraConfigSection = () => {
  const { companyId } = useAuth();
  const [config, setConfig] = useState<SoraConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [docSearchQuery, setDocSearchQuery] = useState("");

  const [hardstopOpen, setHardstopOpen] = useState(true);
  const [restrictionsOpen, setRestrictionsOpen] = useState(false);
  const [documentsOpen, setDocumentsOpen] = useState(false);

  useEffect(() => {
    if (companyId) {
      fetchConfig();
      fetchDocuments();
    }
  }, [companyId]);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("company_sora_config")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = data as any;
        setConfig({
          max_wind_speed_ms: Number(d.max_wind_speed_ms) || DEFAULT_CONFIG.max_wind_speed_ms,
          max_wind_gust_ms: Number(d.max_wind_gust_ms) || DEFAULT_CONFIG.max_wind_gust_ms,
          max_visibility_km: Number(d.max_visibility_km) || DEFAULT_CONFIG.max_visibility_km,
          max_flight_altitude_m: Number(d.max_flight_altitude_m) || DEFAULT_CONFIG.max_flight_altitude_m,
          require_backup_battery: Boolean(d.require_backup_battery),
          require_observer: Boolean(d.require_observer),
          min_temp_c: d.min_temp_c != null ? Number(d.min_temp_c) : DEFAULT_CONFIG.min_temp_c,
          max_temp_c: d.max_temp_c != null ? Number(d.max_temp_c) : DEFAULT_CONFIG.max_temp_c,
          allow_bvlos: Boolean(d.allow_bvlos),
          allow_night_flight: Boolean(d.allow_night_flight),
          max_pilot_inactivity_days: d.max_pilot_inactivity_days != null ? Number(d.max_pilot_inactivity_days) : null,
          max_population_density_per_km2: d.max_population_density_per_km2 != null ? Number(d.max_population_density_per_km2) : null,
          operative_restrictions: d.operative_restrictions || "",
          policy_notes: d.policy_notes || "",
          linked_document_ids: (d.linked_document_ids as string[]) || [],
        });
      }
    } catch (error) {
      console.error("Error fetching SORA config:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from("documents")
        .select("id, tittel, kategori, beskrivelse")
        .eq("company_id", companyId)
        .order("tittel");

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error("Error fetching documents:", error);
    }
  };

  const handleSave = async () => {
    if (!companyId) return;
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("company_sora_config")
        .upsert(
          {
            company_id: companyId,
            max_wind_speed_ms: config.max_wind_speed_ms,
            max_wind_gust_ms: config.max_wind_gust_ms,
            max_visibility_km: config.max_visibility_km,
            max_flight_altitude_m: config.max_flight_altitude_m,
            require_backup_battery: config.require_backup_battery,
            require_observer: config.require_observer,
            min_temp_c: config.min_temp_c,
            max_temp_c: config.max_temp_c,
            allow_bvlos: config.allow_bvlos,
            allow_night_flight: config.allow_night_flight,
            max_pilot_inactivity_days: config.max_pilot_inactivity_days,
            max_population_density_per_km2: config.max_population_density_per_km2,
            operative_restrictions: config.operative_restrictions || null,
            policy_notes: config.policy_notes || null,
            linked_document_ids: config.linked_document_ids,
          },
          { onConflict: "company_id" }
        );

      if (error) throw error;
      toast.success("SORA-innstillinger lagret");
    } catch (error) {
      console.error("Error saving SORA config:", error);
      toast.error("Kunne ikke lagre innstillinger");
    } finally {
      setSaving(false);
    }
  };

  const toggleDocument = (docId: string) => {
    setConfig((prev) => ({
      ...prev,
      linked_document_ids: prev.linked_document_ids.includes(docId)
        ? prev.linked_document_ids.filter((id) => id !== docId)
        : [...prev.linked_document_ids, docId],
    }));
  };

  const filteredDocuments = documents.filter(
    (doc) =>
      doc.tittel.toLowerCase().includes(docSearchQuery.toLowerCase()) ||
      doc.kategori.toLowerCase().includes(docSearchQuery.toLowerCase())
  );

  const linkedDocs = documents.filter((d) =>
    config.linked_document_ids.includes(d.id)
  );

  const getCategoryLabel = (kategori: string) => {
    const labels: Record<string, string> = {
      operasjonsmanual: "Operasjonsmanual",
      sikkerhet: "Sikkerhet",
      vedlikehold: "Vedlikehold",
      sertifikater: "Sertifikater",
      forsikring: "Forsikring",
      kontrakter: "Kontrakter",
      prosedyrer: "Prosedyrer",
      sjekklister: "Sjekklister",
      rapporter: "Rapporter",
      annet: "Annet",
    };
    return labels[kategori] || kategori;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header info */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
        <Info className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium">Selskapsspesifikke SORA-innstillinger</p>
          <p className="text-xs text-muted-foreground mt-1">
            Disse innstillingene overstyrer systemets standardverdier og sendes automatisk til AI-risikovurderingen for alle oppdrag i selskapet. Hardstop-grenser er absolutte og vil alltid utløse NO-GO uavhengig av andre scores.
          </p>
        </div>
      </div>

      {/* Kort 1: Hardstop-grenser */}
      <Collapsible open={hardstopOpen} onOpenChange={setHardstopOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors rounded-t-lg">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    Hardstop-grenser
                  </CardTitle>
                  <CardDescription className="text-xs mt-1">
                    Absolutte terskler som alltid utløser NO-GO — overstyrer alle andre scores
                  </CardDescription>
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${hardstopOpen ? "rotate-180" : ""}`}
                />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-6">
              {/* Vindstyrke */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2 text-sm font-medium">
                    <Wind className="h-4 w-4 text-blue-500" />
                    Maks vindstyrke (middelvind)
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={config.max_wind_speed_ms}
                      onChange={(e) =>
                        setConfig((p) => ({ ...p, max_wind_speed_ms: Number(e.target.value) }))
                      }
                      className="w-20 h-8 text-center"
                      min={1}
                      max={30}
                    />
                    <span className="text-xs text-muted-foreground w-6">m/s</span>
                  </div>
                </div>
                <Slider
                  value={[config.max_wind_speed_ms]}
                  onValueChange={([v]) => setConfig((p) => ({ ...p, max_wind_speed_ms: v }))}
                  min={1}
                  max={30}
                  step={0.5}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>1 m/s</span>
                  <span className="text-xs text-muted-foreground">Standard: 10 m/s</span>
                  <span>30 m/s</span>
                </div>
              </div>

              {/* Vindkast */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2 text-sm font-medium">
                    <Wind className="h-4 w-4 text-cyan-500" />
                    Maks vindkast
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={config.max_wind_gust_ms}
                      onChange={(e) =>
                        setConfig((p) => ({ ...p, max_wind_gust_ms: Number(e.target.value) }))
                      }
                      className="w-20 h-8 text-center"
                      min={1}
                      max={40}
                    />
                    <span className="text-xs text-muted-foreground w-6">m/s</span>
                  </div>
                </div>
                <Slider
                  value={[config.max_wind_gust_ms]}
                  onValueChange={([v]) => setConfig((p) => ({ ...p, max_wind_gust_ms: v }))}
                  min={1}
                  max={40}
                  step={0.5}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>1 m/s</span>
                  <span>Standard: 15 m/s</span>
                  <span>40 m/s</span>
                </div>
              </div>

              {/* Sikt */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <Eye className="h-4 w-4 text-green-500" />
                  Minimum sikt (km)
                </Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    value={config.max_visibility_km}
                    onChange={(e) =>
                      setConfig((p) => ({ ...p, max_visibility_km: Number(e.target.value) }))
                    }
                    className="w-28 h-9"
                    min={0.1}
                    max={20}
                    step={0.1}
                  />
                  <span className="text-sm text-muted-foreground">km sikt (standard: 1 km)</span>
                </div>
              </div>

              {/* Flyhøyde */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <Mountain className="h-4 w-4 text-orange-500" />
                  Maks flyhøyde
                </Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    value={config.max_flight_altitude_m}
                    onChange={(e) =>
                      setConfig((p) => ({ ...p, max_flight_altitude_m: Number(e.target.value) }))
                    }
                    className="w-28 h-9"
                    min={10}
                    max={500}
                    step={10}
                  />
                  <span className="text-sm text-muted-foreground">meter AGL (standard: 120 m)</span>
                </div>
              </div>

              {/* Bryterfelter */}
              <div className="space-y-4 pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BatteryCharging className="h-4 w-4 text-yellow-500" />
                    <div>
                      <p className="text-sm font-medium">Krev reservebatteri</p>
                      <p className="text-xs text-muted-foreground">Oppdrag krever alltid reservebatteri om bord</p>
                    </div>
                  </div>
                  <Switch
                    checked={config.require_backup_battery}
                    onCheckedChange={(v) =>
                      setConfig((p) => ({ ...p, require_backup_battery: v }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-purple-500" />
                    <div>
                      <p className="text-sm font-medium">Krev observatør</p>
                      <p className="text-xs text-muted-foreground">Alle oppdrag krever dedikert observatør</p>
                    </div>
                  </div>
                  <Switch
                    checked={config.require_observer}
                    onCheckedChange={(v) =>
                      setConfig((p) => ({ ...p, require_observer: v }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Plane className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">Tillat BVLOS</p>
                      <p className="text-xs text-muted-foreground">Flyging utenfor visuell rekkevidde er tillatt. Hvis av → HARD STOP ved BVLOS-oppdrag</p>
                    </div>
                  </div>
                  <Switch
                    checked={config.allow_bvlos}
                    onCheckedChange={(v) =>
                      setConfig((p) => ({ ...p, allow_bvlos: v }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Moon className="h-4 w-4 text-indigo-500" />
                    <div>
                      <p className="text-sm font-medium">Tillat nattflyging</p>
                      <p className="text-xs text-muted-foreground">Flyging i mørket er tillatt. Hvis av → HARD STOP ved nattoppdrag</p>
                    </div>
                  </div>
                  <Switch
                    checked={config.allow_night_flight}
                    onCheckedChange={(v) =>
                      setConfig((p) => ({ ...p, allow_night_flight: v }))
                    }
                  />
                </div>
              </div>

              {/* Temperaturgrenser */}
              <div className="space-y-3 pt-2 border-t border-border">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <Thermometer className="h-4 w-4 text-red-500" />
                  Temperaturgrenser (°C)
                </Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Minimum temperatur</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={config.min_temp_c}
                        onChange={(e) =>
                          setConfig((p) => ({ ...p, min_temp_c: Number(e.target.value) }))
                        }
                        className="w-24 h-9"
                        min={-40}
                        max={0}
                      />
                      <span className="text-xs text-muted-foreground">°C (std: -10)</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Maksimum temperatur</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={config.max_temp_c}
                        onChange={(e) =>
                          setConfig((p) => ({ ...p, max_temp_c: Number(e.target.value) }))
                        }
                        className="w-24 h-9"
                        min={20}
                        max={55}
                      />
                      <span className="text-xs text-muted-foreground">°C (std: 40)</span>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Kritisk for LiPo-batterier. Fyring utenfor disse grensene utløser HARD STOP.</p>
              </div>

              {/* Pilotinaktivitet og befolkningstetthet */}
              <div className="space-y-4 pt-2 border-t border-border">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-medium">
                    <Clock className="h-4 w-4 text-orange-500" />
                    Maks pilotinaktivitet (dager)
                  </Label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      value={config.max_pilot_inactivity_days ?? ""}
                      onChange={(e) =>
                        setConfig((p) => ({
                          ...p,
                          max_pilot_inactivity_days: e.target.value === "" ? null : Number(e.target.value),
                        }))
                      }
                      placeholder="Ingen grense"
                      className="w-36 h-9"
                      min={1}
                      max={365}
                    />
                    <span className="text-sm text-muted-foreground">
                      {config.max_pilot_inactivity_days
                        ? `HARD STOP hvis pilot ikke har flydd på >${config.max_pilot_inactivity_days} dager`
                        : "La stå tomt for ingen grense"}
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-medium">
                    <Users className="h-4 w-4 text-teal-500" />
                    Maks befolkningstetthet (pers/km²)
                  </Label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      value={config.max_population_density_per_km2 ?? ""}
                      onChange={(e) =>
                        setConfig((p) => ({
                          ...p,
                          max_population_density_per_km2: e.target.value === "" ? null : Number(e.target.value),
                        }))
                      }
                      placeholder="Ingen grense"
                      className="w-36 h-9"
                      min={1}
                    />
                    <span className="text-sm text-muted-foreground">
                      {config.max_population_density_per_km2
                        ? `HARD STOP over ${config.max_population_density_per_km2} pers/km²`
                        : "La stå tomt for ingen grense"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">SORA-referanse: 500/km² = befolket, 1500/km² = tett bybebyggelse.</p>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Kort 2: Operative begrensninger */}
      <Collapsible open={restrictionsOpen} onOpenChange={setRestrictionsOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors rounded-t-lg">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    Operative begrensninger
                    {config.operative_restrictions && (
                      <Badge variant="secondary" className="ml-1 text-xs">Satt</Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="text-xs mt-1">
                    Fritekst som sendes direkte til AI-en ved risikovurdering
                  </CardDescription>
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${restrictionsOpen ? "rotate-180" : ""}`}
                />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0">
              <Textarea
                value={config.operative_restrictions}
                onChange={(e) =>
                  setConfig((p) => ({ ...p, operative_restrictions: e.target.value }))
                }
                placeholder="Skriv inn selskapets operative begrensninger som AI-en skal ta hensyn til i risikovurderingen...&#10;&#10;Eksempel:&#10;- Selskapet tillater ikke flyging over folkemengder uten skriftlig tillatelse&#10;- Alltid krever grunneierklarering for private eiendommer&#10;- Maksimalt 2 oppdrag per pilot per dag&#10;- Nattflyging krever spesiell godkjenning fra operativ leder"
                className="min-h-[200px] text-sm"
              />
              <p className="text-xs text-muted-foreground mt-2">
                Denne teksten legges direkte inn i AI-prompten og overstyrer/supplerer selskapets operasjonsmanual.
              </p>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Kort 3: Policydokumenter */}
      <Collapsible open={documentsOpen} onOpenChange={setDocumentsOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors rounded-t-lg">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-primary" />
                    Operasjonsmanual / Policydokumenter
                    {config.linked_document_ids.length > 0 && (
                      <Badge variant="secondary" className="ml-1 text-xs">
                        {config.linked_document_ids.length} tilknyttet
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="text-xs mt-1">
                    Lenk dokumenter fra biblioteket og legg inn nøkkelpunkter AI-en kan lese
                  </CardDescription>
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${documentsOpen ? "rotate-180" : ""}`}
                />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-5">
              {/* Dokumentvelger */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Tilknyttede dokumenter (for referanse)</Label>
                <Input
                  placeholder="Søk etter dokumenter..."
                  value={docSearchQuery}
                  onChange={(e) => setDocSearchQuery(e.target.value)}
                  className="h-9 text-sm"
                />
                <div className="max-h-48 overflow-y-auto border rounded-lg divide-y divide-border">
                  {filteredDocuments.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Ingen dokumenter funnet
                    </p>
                  ) : (
                    filteredDocuments.map((doc) => {
                      const isLinked = config.linked_document_ids.includes(doc.id);
                      return (
                        <div
                          key={doc.id}
                          className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/40 transition-colors ${
                            isLinked ? "bg-primary/5" : ""
                          }`}
                          onClick={() => toggleDocument(doc.id)}
                        >
                          <div
                            className={`w-4 h-4 rounded border-2 flex-shrink-0 transition-colors ${
                              isLinked
                                ? "bg-primary border-primary"
                                : "border-muted-foreground"
                            }`}
                          >
                            {isLinked && (
                              <svg
                                className="w-3 h-3 text-primary-foreground m-auto"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={3}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            )}
                          </div>
                          <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{doc.tittel}</p>
                            <p className="text-xs text-muted-foreground">
                              {getCategoryLabel(doc.kategori)}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                {linkedDocs.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {linkedDocs.map((doc) => (
                      <Badge
                        key={doc.id}
                        variant="secondary"
                        className="flex items-center gap-1 text-xs pr-1"
                      >
                        {doc.tittel}
                        <button
                          onClick={() => toggleDocument(doc.id)}
                          className="ml-1 hover:text-destructive transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Policy notes - klartekst for AI */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Nøkkelpunkter fra operasjonsmanualen (AI-lesbar tekst)
                </Label>
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    AI kan ikke lese PDF-filer direkte. Bruk dette feltet til å lime inn eller skrive de viktigste reglene fra operasjonsmanualen i klartekst — dette er det AI faktisk leser og bruker aktivt.
                  </p>
                </div>
                <Textarea
                  value={config.policy_notes}
                  onChange={(e) =>
                    setConfig((p) => ({ ...p, policy_notes: e.target.value }))
                  }
                  placeholder="Lim inn eller skriv nøkkelpunkter fra operasjonsmanualen som AI-en skal bruke aktivt ved risikovurdering...&#10;&#10;Eksempel:&#10;- Seksjon 4.2: Operatøren skal alltid kontrollere NOTAMs minst 2 timer før planlagt flyging&#10;- Seksjon 5.1: Minimum 2 batterier med full kapasitet for oppdrag over 15 min&#10;- Seksjon 6.3: Alle oppdrag i befolkede områder krever skriftlig grunneierklarering&#10;- Seksjon 7.1: Observatør obligatorisk ved sikt under 3 km"
                  className="min-h-[200px] text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  AI vil vurdere om oppdraget er i tråd med disse reglene og nevne avvik i risikovurderingen.
                </p>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Lagre-knapp */}
      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? "Lagrer..." : "Lagre SORA-innstillinger"}
        </Button>
      </div>
    </div>
  );
};
