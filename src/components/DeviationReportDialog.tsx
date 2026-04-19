import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { addToQueue } from "@/lib/offlineQueue";

interface Category {
  id: string;
  parent_id: string | null;
  label: string;
  sort_order: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  missionId: string | null;
  flightLogId: string | null;
  onDone?: () => void;
}

export const DeviationReportDialog = ({ open, onOpenChange, missionId, flightLogId, onDone }: Props) => {
  const { user, companyId } = useAuth();
  const [step, setStep] = useState<"prompt" | "select">("prompt");
  const [categories, setCategories] = useState<Category[]>([]);
  const [path, setPath] = useState<Category[]>([]); // selected path from root
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep("prompt");
    setPath([]);
    setComment("");
    if (companyId) {
      (supabase as any)
        .from("deviation_report_categories")
        .select("id, parent_id, label, sort_order")
        .eq("company_id", companyId)
        .then(({ data }: any) => setCategories(data || []));
    }
  }, [open, companyId]);

  const currentParentId = path.length > 0 ? path[path.length - 1].id : null;
  const visibleOptions = categories
    .filter((c) => c.parent_id === currentParentId)
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));

  const handleClose = () => {
    onOpenChange(false);
    onDone?.();
  };

  const handleSubmit = async () => {
    if (!missionId || !companyId || !user || path.length === 0) {
      handleClose();
      return;
    }
    setSubmitting(true);
    const payload = {
      mission_id: missionId,
      flight_log_id: flightLogId,
      company_id: companyId,
      reported_by: user.id,
      category_path: path.map((p) => p.label),
      category_ids: path.map((p) => p.id),
      comment: comment.trim() || null,
    };

    if (!navigator.onLine) {
      addToQueue({
        table: "mission_deviation_reports",
        operation: "insert",
        data: payload,
        description: "Avviksrapport (offline)",
      });
      toast.success("Avviksrapport lagret lokalt – synkroniseres senere");
      setSubmitting(false);
      handleClose();
      return;
    }

    const { error } = await (supabase as any).from("mission_deviation_reports").insert(payload);
    setSubmitting(false);
    if (error) {
      toast.error(`Kunne ikke lagre rapport: ${error.message}`);
    } else {
      toast.success("Avviksrapport lagret");
      handleClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="w-[95vw] max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === "prompt" ? "Avviksrapport" : "Velg kategori"}
          </DialogTitle>
        </DialogHeader>

        {step === "prompt" && (
          <>
            <p className="text-sm">Ønsker du å rapportere noe fra flyturen?</p>
            <DialogFooter className="flex-row gap-2 sm:justify-end">
              <Button variant="outline" onClick={handleClose}>
                Nei
              </Button>
              <Button onClick={() => setStep("select")}>Ja</Button>
            </DialogFooter>
          </>
        )}

        {step === "select" && (
          <div className="space-y-3">
            {/* Breadcrumb */}
            {path.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                {path.map((p, i) => (
                  <span key={p.id} className="flex items-center gap-1">
                    {i > 0 && <ChevronRight className="w-3 h-3" />}
                    <span className="font-medium text-foreground">{p.label}</span>
                  </span>
                ))}
              </div>
            )}

            {/* Back */}
            {path.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setPath((p) => p.slice(0, -1))}
                className="h-7 px-2"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Tilbake
              </Button>
            )}

            {/* Options */}
            {visibleOptions.length > 0 ? (
              <div className="space-y-1 max-h-60 overflow-y-auto border rounded-md p-1">
                {visibleOptions.map((opt) => {
                  const hasChildren = categories.some((c) => c.parent_id === opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm rounded hover:bg-muted/50 text-left"
                      onClick={() => setPath((p) => [...p, opt])}
                    >
                      <span>{opt.label}</span>
                      {hasChildren && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic px-1">
                Ingen flere underkategorier — du kan lagre rapporten nå.
              </p>
            )}

            <div>
              <label className="text-xs font-medium text-muted-foreground">Kommentar (valgfritt)</label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Beskriv hendelsen…"
                rows={3}
              />
            </div>

            <DialogFooter className="flex-row gap-2 sm:justify-end">
              <Button variant="outline" onClick={handleClose} disabled={submitting}>
                Avbryt
              </Button>
              <Button onClick={handleSubmit} disabled={submitting || path.length === 0}>
                {submitting ? "Lagrer…" : "Lagre rapport"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
