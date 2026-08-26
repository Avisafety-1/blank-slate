import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { FileDown, Loader2, ShieldCheck, GraduationCap } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { exportEvaluationToPdf } from "@/lib/evaluationPdfExport";
import type { EvaluationTemplateLite, EvaluationResponseRow } from "@/hooks/useMissionEvaluation";

interface PersonOption {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: EvaluationTemplateLite;
  response: EvaluationResponseRow;
  mission: any;
  studentName: string;
  instructorName: string;
  companyPeople: PersonOption[];
  onSaved?: () => void;
}

/**
 * Lets the user pick who the finished evaluation is visible to, then exports it to PDF.
 * The student always keeps access when set as student on the evaluation.
 */
export const EvaluationExportDialog = ({
  open,
  onOpenChange,
  template,
  response,
  mission,
  studentName,
  instructorName,
  companyPeople,
  onSaved,
}: Props) => {
  const { t, i18n } = useTranslation();
  const { companyId, user } = useAuth();
  const [shareWithAdmins, setShareWithAdmins] = useState(true);
  const [extraViewerIds, setExtraViewerIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setShareWithAdmins(response.share_with_admins ?? true);
    setExtraViewerIds(response.extra_viewer_ids ?? []);
    setSearch("");
  }, [open, response]);

  const studentId = response.student_id ?? null;

  const filteredPeople = useMemo(
    () =>
      companyPeople
        .filter((p) => p.id !== studentId)
        .filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase())),
    [companyPeople, search, studentId]
  );

  const formatDate = (iso?: string | null) => {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleString(i18n.language === "en" ? "en-GB" : "nb-NO");
    } catch {
      return "";
    }
  };

  const visibilitySummary = useMemo(() => {
    const names = [
      instructorName || t("evaluation.visibility.instructor"),
      studentName || t("evaluation.visibility.student"),
      ...(shareWithAdmins ? [t("evaluation.visibility.admins")] : []),
      ...extraViewerIds
        .map((id) => companyPeople.find((p) => p.id === id)?.name)
        .filter((n): n is string => !!n),
    ];
    return Array.from(new Set(names));
  }, [instructorName, studentName, shareWithAdmins, extraViewerIds, companyPeople, t]);

  const handleExport = async () => {
    setBusy(true);
    try {
      // Persist the chosen visibility so the app and the PDF stay in sync
      const { error } = await supabase
        .from("evaluation_responses")
        .update({
          share_with_admins: shareWithAdmins,
          extra_viewer_ids: extraViewerIds,
        } as any)
        .eq("id", response.id);
      if (error) throw error;

      const { blob, fileName } = await exportEvaluationToPdf({
        title: template.title,
        description: template.description,
        categories: template.structure,
        scores: response.scores ?? {},
        comments: response.comments ?? {},
        overallComment: response.overall_comment,
        overallAverage: response.overall_average,
        studentName,
        instructorName,
        missionName: mission?.tittel ?? null,
        missionTime: formatDate(mission?.tidspunkt),
        evaluatedAt: formatDate(response.evaluated_at),
        companyName: mission?.company_name ?? null,
        signatureUrl: response.student_signature_url ?? null,
        signatureName: response.student_signature_name ?? null,
        signedAt: formatDate(response.student_signed_at),
        visibilitySummary,
      });

      // Store the PDF in /dokumenter instead of downloading it
      const filePath = `${companyId}/${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, blob, { contentType: "application/pdf" });
      if (uploadError) throw uploadError;

      const docTitle = [template.title, studentName, formatDate(response.evaluated_at)]
        .filter(Boolean)
        .join(" – ");

      const { error: insertError } = await supabase.from("documents").insert({
        tittel: docTitle,
        beskrivelse: visibilitySummary.length
          ? `${t("evaluation.pdf.visibility")}: ${visibilitySummary.join(", ")}`
          : null,
        kategori: "vurderingsskjema",
        fil_url: filePath,
        fil_navn: fileName,
        fil_storrelse: blob.size,
        company_id: companyId,
        user_id: user?.id ?? null,
        global_visibility: false,
        visible_to_children: false,
      } as any);
      if (insertError) throw insertError;

      toast.success(t("evaluation.export.savedToDocuments"));
      onSaved?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Evaluation PDF export failed:", err);
      toast.error(err?.message ?? t("evaluation.export.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5 text-primary" />
            {t("evaluation.export.title")}
          </DialogTitle>
          <DialogDescription>{t("evaluation.export.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 text-sm">
            <GraduationCap className="h-4 w-4 text-primary shrink-0" />
            <span className="min-w-0 truncate">
              {t("evaluation.export.studentAlways", {
                name: studentName || t("evaluation.visibility.student"),
              })}
            </span>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="eval-export-admins" className="text-sm">
                {t("evaluation.export.adminsOnly")}
              </Label>
            </div>
            <Switch
              id="eval-export-admins"
              checked={shareWithAdmins}
              onCheckedChange={setShareWithAdmins}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm">{t("evaluation.visibility.otherViewers")}</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("common.search")}
              className="h-8"
            />
            <div className="max-h-48 overflow-y-auto rounded-md border bg-background/70 divide-y">
              {filteredPeople.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  {t("evaluation.visibility.noPeople")}
                </p>
              ) : (
                filteredPeople.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={extraViewerIds.includes(p.id)}
                      onCheckedChange={(checked) =>
                        setExtraViewerIds((prev) =>
                          checked ? [...new Set([...prev, p.id])] : prev.filter((id) => id !== p.id)
                        )
                      }
                    />
                    <span className="truncate">{p.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            {t("common.cancel")}
          </Button>
          <Button onClick={handleExport} disabled={busy} className="w-full sm:w-auto">
            {busy ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <FileDown className="h-4 w-4 mr-1" />
            )}
            {t("evaluation.export.action")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EvaluationExportDialog;
