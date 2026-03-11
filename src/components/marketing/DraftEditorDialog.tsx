import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Sparkles,
  Loader2,
  RefreshCw,
  Layers,
  ChevronDown,
  Save,
  BookmarkPlus,
  Image,
} from "lucide-react";
import {
  GENERATION_PRESETS,
  POST_STRUCTURES,
  BRAND_VOICE_DEFAULTS,
} from "./marketingPresets";
import { VisualGeneratorDialog } from "./VisualGeneratorDialog";
import { useQuery, useQueryClient as useQC2 } from "@tanstack/react-query";

const DraftVisualSection = ({ draftId }: { draftId: string }) => {
  const [genOpen, setGenOpen] = useState(false);
  const { data: media = [] } = useQuery({
    queryKey: ["marketing-draft-media", draftId],
    queryFn: async () => {
      const { data } = await supabase
        .from("marketing_media")
        .select("*")
        .eq("draft_id", draftId)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  return (
    <div className="space-y-2 p-2">
      {media.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {media.map((m: any) => (
            <img key={m.id} src={m.file_url} alt={m.title || ""} className="rounded-md border border-border w-full object-cover aspect-video" />
          ))}
        </div>
      )}
      <Button variant="outline" size="sm" className="gap-1 w-full" onClick={() => setGenOpen(true)}>
        <Image className="w-3.5 h-3.5" />
        Generer visuell
      </Button>
      <VisualGeneratorDialog open={genOpen} onOpenChange={setGenOpen} draftId={draftId} />
    </div>
  );
};

interface Draft {
  id: string;
  title: string;
  content: string;
  platform: string | null;
  status: string;
  metadata?: any;
}

interface StructuredDraft {
  title: string;
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
  suggestedAudience: string;
  characterCount: number;
  whyItWorks: string;
  audienceFit: string;
  followUpVariation: string;
}

interface Props {
  draft: Draft | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const platforms = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "blog", label: "Blogg" },
  { value: "email", label: "E-post" },
];

const statuses = [
  { value: "draft", label: "Utkast" },
  { value: "review", label: "Til gjennomgang" },
  { value: "approved", label: "Godkjent" },
];

export const DraftEditorDialog = ({ draft, open, onOpenChange }: Props) => {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState("linkedin");
  const [status, setStatus] = useState("draft");
  const [generating, setGenerating] = useState(false);

  // Structured fields
  const [hook, setHook] = useState("");
  const [body, setBody] = useState("");
  const [cta, setCta] = useState("");
  const [hashtags, setHashtags] = useState("");

  // Generation options
  const [preset, setPreset] = useState("safety_tip");
  const [structure, setStructure] = useState("hook_insight_cta");
  const [language, setLanguage] = useState<"no" | "en">("no");

  // Review helper
  const [review, setReview] = useState<{
    whyItWorks: string;
    audienceFit: string;
    followUpVariation: string;
  } | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  // Variants
  const [variants, setVariants] = useState<StructuredDraft[]>([]);
  const [activeVariant, setActiveVariant] = useState(0);

  useEffect(() => {
    if (draft) {
      setTitle(draft.title);
      setPlatform(draft.platform || "linkedin");
      setStatus(draft.status || "draft");
      setVariants([]);
      setActiveVariant(0);
      setReview(null);

      const meta = draft.metadata as any;
      if (meta?.structured) {
        setHook(meta.structured.hook || "");
        setBody(meta.structured.body || "");
        setCta(meta.structured.cta || "");
        setHashtags(meta.structured.hashtags?.join(", ") || "");
        if (meta.structured.whyItWorks) {
          setReview({
            whyItWorks: meta.structured.whyItWorks,
            audienceFit: meta.structured.audienceFit || "",
            followUpVariation: meta.structured.followUpVariation || "",
          });
        }
        if (meta.preset) setPreset(meta.preset);
        if (meta.structure) setStructure(meta.structure);
        if (meta.language) setLanguage(meta.language);
      } else {
        // Legacy plain-text content
        setHook("");
        setBody(draft.content || "");
        setCta("");
        setHashtags("");
      }
    }
  }, [draft]);

  const composePlainContent = () => {
    const parts = [hook, body, cta, hashtags ? hashtags.split(",").map((h) => `#${h.trim()}`).join(" ") : ""].filter(Boolean);
    return parts.join("\n\n");
  };

  const handleSave = async () => {
    if (!draft) return;
    const content = composePlainContent();
    const metadata = {
      ...(draft.metadata as any || {}),
      structured: {
        hook,
        body,
        cta,
        hashtags: hashtags.split(",").map((h) => h.trim()).filter(Boolean),
        ...(review || {}),
      },
      preset,
      structure,
      language,
    };

    const { error } = await supabase
      .from("marketing_drafts")
      .update({ title, content, platform, status, metadata, updated_at: new Date().toISOString() })
      .eq("id", draft.id);
    if (error) {
      toast.error("Kunne ikke lagre");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["marketing-drafts"] });
    queryClient.invalidateQueries({ queryKey: ["marketing-drafts-count"] });
    queryClient.invalidateQueries({ queryKey: ["marketing-approved-count"] });
    toast.success("Utkast lagret");
    onOpenChange(false);
  };

  const handleSaveAsTemplate = async () => {
    if (!draft) return;
    const content = composePlainContent();
    const metadata = {
      structured: { hook, body, cta, hashtags: hashtags.split(",").map((h) => h.trim()).filter(Boolean) },
      preset,
      structure,
      language,
      isTemplate: true,
    };
    const { error } = await supabase
      .from("marketing_drafts")
      .update({ title, content, platform, status, metadata, updated_at: new Date().toISOString() })
      .eq("id", draft.id);
    if (error) {
      toast.error("Kunne ikke lagre som mal");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["marketing-drafts"] });
    toast.success("Lagret som mal");
  };

  const loadBrandSettings = () => {
    try {
      const stored = localStorage.getItem("avisafe-marketing-brand-settings");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  };

  const handleGenerate = async (variantCount = 1) => {
    setGenerating(true);
    setVariants([]);
    setActiveVariant(0);
    try {
      const presetConfig = GENERATION_PRESETS.find((p) => p.id === preset);
      const brandSettings = loadBrandSettings();

      const { data, error } = await supabase.functions.invoke("marketing-ai", {
        body: {
          type: "draft",
          ideaTitle: title,
          platform,
          preset,
          structure,
          language,
          variantCount,
          presetConfig: presetConfig
            ? { label: presetConfig.label, tone: presetConfig.tone, audience: presetConfig.audience, ctaStyle: presetConfig.ctaStyle, hashtagStyle: presetConfig.hashtagStyle }
            : undefined,
          brandSettings: brandSettings
            ? { customRules: brandSettings.customRules, bannedPhrases: brandSettings.bannedPhrases }
            : undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (variantCount > 1 && data.variants) {
        setVariants(data.variants);
        applyStructured(data.variants[0]);
        toast.success(`${data.variants.length} varianter generert`);
      } else if (data.structured) {
        applyStructured(data.structured);
        toast.success("Innhold generert med AI");
      }
    } catch (e: any) {
      toast.error(e.message || "Feil ved AI-generering");
    } finally {
      setGenerating(false);
    }
  };

  const applyStructured = (s: StructuredDraft) => {
    if (s.title) setTitle(s.title);
    setHook(s.hook || "");
    setBody(s.body || "");
    setCta(s.cta || "");
    setHashtags(s.hashtags?.join(", ") || "");
    if (s.whyItWorks) {
      setReview({
        whyItWorks: s.whyItWorks,
        audienceFit: s.audienceFit || "",
        followUpVariation: s.followUpVariation || "",
      });
      setReviewOpen(true);
    }
  };

  const selectVariant = (idx: number) => {
    setActiveVariant(idx);
    applyStructured(variants[idx]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Rediger utkast</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Title */}
          <div>
            <label className="text-sm font-medium text-foreground">Tittel</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          {/* Row: Platform, Status, Language */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium text-foreground">Plattform</label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {platforms.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Status</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {statuses.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Språk</label>
              <Select value={language} onValueChange={(v) => setLanguage(v as "no" | "en")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">Norsk</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row: Preset, Structure */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-foreground">Innholdstype</label>
              <Select value={preset} onValueChange={setPreset}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GENERATION_PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Poststruktur</label>
              <Select value={structure} onValueChange={setStructure}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {POST_STRUCTURES.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Generate buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleGenerate(1)}
              disabled={generating || !title.trim()}
              className="gap-1"
            >
              {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              Generer med AI
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleGenerate(1)}
              disabled={generating || !title.trim()}
              className="gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              Regenerer
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleGenerate(3)}
              disabled={generating || !title.trim()}
              className="gap-1"
            >
              <Layers className="w-3 h-3" />
              3 varianter
            </Button>
          </div>

          {/* Variant tabs */}
          {variants.length > 1 && (
            <div className="flex gap-2">
              {variants.map((_, i) => (
                <Button
                  key={i}
                  variant={i === activeVariant ? "default" : "outline"}
                  size="sm"
                  onClick={() => selectVariant(i)}
                >
                  Variant {i + 1}
                </Button>
              ))}
            </div>
          )}

          {/* Structured content fields */}
          <div>
            <label className="text-sm font-medium text-foreground">Hook</label>
            <Textarea
              value={hook}
              onChange={(e) => setHook(e.target.value)}
              rows={2}
              placeholder="Åpningslinjen som fanger oppmerksomhet..."
              className="text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">Hovedinnhold</label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              placeholder="Hoveddelen av innlegget..."
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">CTA (Call to Action)</label>
            <Textarea
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              rows={2}
              placeholder="Handlingsoppfordring..."
              className="text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">Hashtags</label>
            <Input
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              placeholder="DroneSafety, AviSafe, UAS (kommaseparert)"
              className="text-sm"
            />
          </div>

          {/* Review helper */}
          {review && (
            <Collapsible open={reviewOpen} onOpenChange={setReviewOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground w-full justify-between">
                  <span>AI-vurdering</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${reviewOpen ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="rounded-md border border-border bg-muted/30 p-4 space-y-3 text-sm">
                  <div>
                    <p className="font-medium text-foreground">Hvorfor dette fungerer</p>
                    <p className="text-muted-foreground">{review.whyItWorks}</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Målgruppe</p>
                    <p className="text-muted-foreground">{review.audienceFit}</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Foreslått oppfølging</p>
                    <p className="text-muted-foreground">{review.followUpVariation}</p>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
           )}

          {/* Visual section */}
          {draft && (
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground w-full justify-between">
                  <span className="flex items-center gap-1"><Image className="w-3.5 h-3.5" /> Visuelt</span>
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <DraftVisualSection draftId={draft.id} />
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={handleSaveAsTemplate} className="gap-1 mr-auto" title="Lagre som mal">
            <BookmarkPlus className="w-4 h-4" />
            Lagre som mal
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
          <Button onClick={handleSave} className="gap-1">
            <Save className="w-4 h-4" />
            Lagre
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
