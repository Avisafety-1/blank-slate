import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

interface DocumentUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  defaultExpiryDate?: Date;
}

export const DocumentUploadDialog = ({
  open,
  onOpenChange,
  onSuccess,
  defaultExpiryDate,
}: DocumentUploadDialogProps) => {
  const { companyId } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadType, setUploadType] = useState<"file" | "url">("file");
  const [formData, setFormData] = useState({
    title: "",
    category: "annet",
    expiryDate: defaultExpiryDate ? defaultExpiryDate.toISOString().split("T")[0] : "",
    notificationDays: "30",
    websiteUrl: "",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error("Filen er for stor. Maksimal størrelse er 10MB.");
        return;
      }
      setSelectedFile(file);
      if (!formData.title) {
        setFormData((prev) => ({ ...prev, title: file.name }));
      }
    }
  };

  const handleUpload = async () => {
    if (!formData.title) {
      toast.error("Vennligst fyll inn tittel");
      return;
    }

    if (uploadType === "file" && !selectedFile) {
      toast.error("Vennligst velg en fil");
      return;
    }

    if (uploadType === "url" && !formData.websiteUrl) {
      toast.error("Vennligst skriv inn en URL");
      return;
    }

    try {
      setUploading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Ikke innlogget");

      let fileUrl = null;
      let fileName = null;
      let fileSize = null;

      if (uploadType === "file" && selectedFile) {
        const fileExt = selectedFile.name.split(".").pop();
        const filePath = `${user.id}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(filePath, selectedFile);

        if (uploadError) throw uploadError;

        fileUrl = filePath;
        fileName = selectedFile.name;
        fileSize = selectedFile.size;
      }

      const { error: insertError } = await supabase.from("documents").insert({
        tittel: formData.title,
        kategori: formData.category,
        gyldig_til: formData.expiryDate || null,
        varsel_dager_for_utløp: parseInt(formData.notificationDays),
        fil_url: fileUrl,
        fil_navn: fileName,
        fil_storrelse: fileSize,
        nettside_url: uploadType === "url" ? formData.websiteUrl : null,
        company_id: companyId,
      });

      if (insertError) throw insertError;

      toast.success("Dokument lastet opp");
      onOpenChange(false);
      if (onSuccess) onSuccess();

      // Reset form
      setSelectedFile(null);
      setFormData({
        title: "",
        category: "annet",
        expiryDate: "",
        notificationDays: "30",
        websiteUrl: "",
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error: any) {
      console.error("Error uploading document:", error);
      toast.error(error.message || "Kunne ikke laste opp dokument");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Last opp dokument</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <RadioGroup
            value={uploadType}
            onValueChange={(value: "file" | "url") => setUploadType(value)}
            className="flex gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="file" id="file" />
              <Label htmlFor="file">Last opp fil</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="url" id="url" />
              <Label htmlFor="url">Legg til URL</Label>
            </div>
          </RadioGroup>

          {uploadType === "file" ? (
            <div className="space-y-2">
              <Label>Fil</Label>
              <div className="flex gap-2">
                <Input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  className="flex-1"
                />
                {selectedFile && (
                  <span className="text-sm text-muted-foreground flex items-center">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="websiteUrl">URL til nettside</Label>
              <Input
                id="websiteUrl"
                type="url"
                placeholder="https://eksempel.no/dokument"
                value={formData.websiteUrl}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    websiteUrl: e.target.value,
                  }))
                }
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="title">Tittel</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, title: e.target.value }))
              }
              placeholder="Dokumenttittel"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Kategori</Label>
            <Select
              value={formData.category}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, category: value }))
              }
            >
              <SelectTrigger id="category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="regelverk">Regelverk</SelectItem>
                <SelectItem value="prosedyrer">Prosedyrer</SelectItem>
                <SelectItem value="sjekklister">Sjekklister</SelectItem>
                <SelectItem value="rapporter">Rapporter</SelectItem>
                <SelectItem value="nettsider">Nettsider</SelectItem>
                <SelectItem value="oppdrag">Oppdrag</SelectItem>
                <SelectItem value="loggbok">Loggbok</SelectItem>
                <SelectItem value="annet">Annet</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="expiryDate">Utløpsdato (valgfritt)</Label>
            <Input
              id="expiryDate"
              type="date"
              value={formData.expiryDate}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, expiryDate: e.target.value }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notificationDays">
              Varsle dager før utløp
            </Label>
            <Input
              id="notificationDays"
              type="number"
              value={formData.notificationDays}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  notificationDays: e.target.value,
                }))
              }
              min="1"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={uploading}
            >
              Avbryt
            </Button>
            <Button onClick={handleUpload} disabled={uploading}>
              <Upload className="w-4 h-4 mr-2" />
              {uploading ? "Laster opp..." : "Last opp"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
