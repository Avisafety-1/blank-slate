import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PenTool, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SignatureDrawerDialog } from "@/components/SignatureDrawerDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  responseId?: string | null;
  status?: string | null;
  studentId?: string | null;
  studentName?: string | null;
  signatureUrl?: string | null;
  signedAt?: string | null;
  signatureName?: string | null;
  onSigned?: (data: { url: string; signedAt: string; name: string }) => void;
}

/**
 * Signaturseksjon for eleven. Eleven kan signere sitt eget fullførte
 * evalueringsskjema med touch/mus. Signaturen lagres kun på evalueringen.
 */
export const EvaluationSignatureSection = ({
  responseId,
  status,
  studentId,
  studentName,
  signatureUrl,
  signedAt,
  signatureName,
  onSigned,
}: Props) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localUrl, setLocalUrl] = useState<string | null>(signatureUrl ?? null);
  const [localSignedAt, setLocalSignedAt] = useState<string | null>(signedAt ?? null);
  const [localName, setLocalName] = useState<string | null>(signatureName ?? null);

  const url = localUrl ?? signatureUrl ?? null;
  const at = localSignedAt ?? signedAt ?? null;
  const name = localName ?? signatureName ?? studentName ?? null;

  const isStudent = !!user && !!studentId && user.id === studentId;
  const completed = status === "completed";
  const canSign = isStudent && completed && !url && !!responseId;

  const handleSaved = async (uploadedUrl: string) => {
    if (!responseId) return;
    setSaving(true);
    try {
      const { data, error } = await (supabase.rpc as any)("sign_evaluation_response", {
        p_response_id: responseId,
        p_signature_url: uploadedUrl,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      const nextUrl = row?.student_signature_url ?? uploadedUrl;
      const nextAt = row?.student_signed_at ?? new Date().toISOString();
      const nextName = row?.student_signature_name ?? studentName ?? "";
      setLocalUrl(nextUrl);
      setLocalSignedAt(nextAt);
      setLocalName(nextName);
      onSigned?.({ url: nextUrl, signedAt: nextAt, name: nextName });
      toast.success(t("evaluation.signature.saved"));
    } catch (err: any) {
      console.error("Error signing evaluation:", err);
      toast.error(err?.message ?? t("evaluation.signature.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const formattedDate = at
    ? new Date(at).toLocaleString(i18n.language === "en" ? "en-GB" : "nb-NO")
    : "";

  return (
    <Card className="p-4 space-y-3 pointer-events-auto">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-sm font-semibold flex items-center gap-2">
          <PenTool className="h-4 w-4 text-primary" />
          {t("evaluation.signature.title")}
        </Label>
        {url ? (
          <span className="flex items-center gap-1 text-xs text-primary">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t("evaluation.signature.signed")}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {t("evaluation.signature.pending")}
          </span>
        )}
      </div>

      {url ? (
        <div className="space-y-2">
          <div className="rounded-lg border bg-muted p-3">
            <img
              src={url}
              alt={t("evaluation.signature.title")}
              className="max-h-24 mx-auto object-contain"
              loading="lazy"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {t("evaluation.signature.signedBy", { name: name || "—", date: formattedDate })}
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {completed
            ? t("evaluation.signature.waitingFor", { name: studentName || "—" })
            : t("evaluation.signature.availableAfterSave")}
        </p>
      )}

      {canSign && (
        <Button
          className="w-full sm:w-auto"
          disabled={saving}
          onClick={() => setDrawerOpen(true)}
        >
          <PenTool className="h-4 w-4 mr-2" />
          {saving ? t("evaluation.signature.saving") : t("evaluation.signature.sign")}
        </Button>
      )}

      <SignatureDrawerDialog
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSave={handleSaved}
        persistToProfile={false}
      />
    </Card>
  );
};

export default EvaluationSignatureSection;
