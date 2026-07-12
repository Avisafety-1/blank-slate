import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

interface CreateFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const CreateFolderDialog = ({ open, onOpenChange, onSuccess }: CreateFolderDialogProps) => {
  const { t } = useTranslation();
  const { companyId, user } = useAuth();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || !companyId) return;
    setSaving(true);
    const { error } = await supabase.from("document_folders").insert({
      name: name.trim(),
      company_id: companyId,
      created_by: user?.id,
    });
    setSaving(false);
    if (error) {
      toast.error(t('documents.folderDialog.createFailed'));
      return;
    }
    toast.success(t('documents.folderDialog.created'));
    setName("");
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('documents.folderDialog.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Label htmlFor="folder-name">{t('documents.folderDialog.nameLabel')}</Label>
          <Input
            id="folder-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('documents.folderDialog.namePlaceholder')}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('documents.folderDialog.cancel')}</Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving}>
            {saving ? t('documents.folderDialog.saving') : t('documents.folderDialog.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
