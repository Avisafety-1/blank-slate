import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { PenTool, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SignatureDrawerDialog } from "@/components/SignatureDrawerDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface SignaturePadProps {
  onSave?: (signatureUrl: string) => void;
  existingSignatureUrl?: string | null;
  className?: string;
}

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export const SignaturePad = ({ onSave, existingSignatureUrl, className }: SignaturePadProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(existingSignatureUrl ?? null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSignatureUrl(existingSignatureUrl ?? null);
  }, [existingSignatureUrl]);

  const handleSaved = (url: string) => {
    setSignatureUrl(url);
    onSave?.(url);
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error(t("profile.signatureInvalidType", "Ugyldig filtype. Bruk PNG, JPG eller WebP."));
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(t("profile.signatureTooLarge", "Filen er for stor (maks 2 MB)."));
      return;
    }

    setIsUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const fileName = `${user.id}/signature_upload_${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("signatures")
        .upload(fileName, file, { contentType: file.type, upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("signatures").getPublicUrl(fileName);

      const { error: updateError } = await (supabase as any)
        .from("profiles")
        .update({ signature_url: urlData.publicUrl })
        .eq("id", user.id);
      if (updateError) throw updateError;

      handleSaved(urlData.publicUrl);
      toast.success(t("profile.signatureUploaded", "Signatur lastet opp"));
    } catch (err: any) {
      console.error("Error uploading signature:", err);
      toast.error(t("profile.signatureUploadFailed", "Kunne ikke laste opp signatur: ") + (err.message ?? ""));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className={className}>
      <div className="space-y-3">
        {signatureUrl ? (
          <div className="rounded-lg border p-4 bg-muted">
            <img
              src={signatureUrl}
              alt={t("profile.signature", "Signatur")}
              className="max-h-24 mx-auto object-contain"
              loading="lazy"
            />
          </div>
        ) : null}

        <Button
          variant="outline"
          onClick={() => setOpen(true)}
          className="w-full justify-start"
        >
          <PenTool className="h-4 w-4 mr-2" />
          {signatureUrl
            ? t("profile.changeSignature", "Endre signatur")
            : t("profile.drawSignature", "Tegn signatur")}
        </Button>

        <Button
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="w-full justify-start"
        >
          <Upload className="h-4 w-4 mr-2" />
          {isUploading
            ? t("profile.uploadingSignature", "Laster opp...")
            : t("profile.uploadSignature", "Last opp signatur")}
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={handleFileSelected}
        />

        <SignatureDrawerDialog open={open} onClose={() => setOpen(false)} onSave={handleSaved} />
      </div>
    </div>
  );
};
