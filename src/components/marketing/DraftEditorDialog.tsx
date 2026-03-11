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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles, Loader2 } from "lucide-react";

interface Draft {
  id: string;
  title: string;
  content: string;
  platform: string | null;
  status: string;
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
  const [content, setContent] = useState("");
  const [platform, setPlatform] = useState("linkedin");
  const [status, setStatus] = useState("draft");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (draft) {
      setTitle(draft.title);
      setContent(draft.content || "");
      setPlatform(draft.platform || "linkedin");
      setStatus(draft.status || "draft");
    }
  }, [draft]);

  const handleSave = async () => {
    if (!draft) return;
    const { error } = await supabase
      .from("marketing_drafts")
      .update({ title, content, platform, status, updated_at: new Date().toISOString() })
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

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("marketing-ai", {
        body: { type: "draft", ideaTitle: title, platform },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setContent(data.content);
      toast.success("Innhold generert med AI");
    } catch (e: any) {
      toast.error(e.message || "Feil ved AI-generering");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Rediger utkast</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground">Tittel</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
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
            <div className="flex-1">
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
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-foreground">Innhold</label>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerate}
                disabled={generating || !title.trim()}
                className="gap-1"
              >
                {generating ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                Generer med AI
              </Button>
            </div>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={12}
              placeholder="Skriv eller generer innhold..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
          <Button onClick={handleSave}>Lagre</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
