import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Building2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface AddNewsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  news?: any | null;
}

export const AddNewsDialog = ({ open, onOpenChange, news }: AddNewsDialogProps) => {
  const { t } = useTranslation();
  const { companyId } = useAuth();
  const [tittel, setTittel] = useState("");
  const [innhold, setInnhold] = useState("");
  const [pinOnTop, setPinOnTop] = useState(false);
  const [visibleToChildren, setVisibleToChildren] = useState(false);
  const [isParentCompany, setIsParentCompany] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    const check = async () => {
      const { data } = await supabase
        .from('companies')
        .select('id')
        .eq('parent_company_id', companyId)
        .limit(1);
      setIsParentCompany((data?.length ?? 0) > 0);
    };
    check();
  }, [companyId]);

  useEffect(() => {
    if (news && open) {
      setTittel(news.tittel || "");
      setInnhold(news.innhold || "");
      setPinOnTop(news.pin_on_top || false);
      setVisibleToChildren(news.visible_to_children || false);
    } else if (!open) {
      setTittel("");
      setInnhold("");
      setPinOnTop(false);
      setVisibleToChildren(false);
    }
  }, [news, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tittel.trim() || !innhold.trim()) {
      toast.error(t("news.errorRequired"));
      return;
    }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error(t("news.mustBeLoggedIn"));
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, company_id')
        .eq('id', user.id)
        .single();

      if (news) {
        const { error } = await (supabase as any)
          .from('news')
          .update({
            tittel: tittel.trim(),
            innhold: innhold.trim(),
            pin_on_top: pinOnTop,
            visible_to_children: isParentCompany ? visibleToChildren : false,
            oppdatert_dato: new Date().toISOString()
          })
          .eq('id', news.id);
        if (error) throw error;
        toast.success(t("news.updated"));
      } else {
        const { error } = await (supabase as any)
          .from('news')
          .insert({
            tittel: tittel.trim(),
            innhold: innhold.trim(),
            pin_on_top: pinOnTop,
            visible_to_children: isParentCompany ? visibleToChildren : false,
            user_id: user.id,
            company_id: profile?.company_id,
            forfatter: profile?.full_name || t("news.unknown")
          });
        if (error) throw error;
        toast.success(t("news.added"));
      }
      setTittel("");
      setInnhold("");
      setPinOnTop(false);
      setVisibleToChildren(false);
      onOpenChange(false);
    } catch (error) {
      console.error("Error adding news:", error);
      toast.error(t("news.errorAdd"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{news ? t("news.editTitle") : t("news.addTitle")}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tittel">{t("news.title")}</Label>
            <Input
              id="tittel"
              value={tittel}
              onChange={(e) => setTittel(e.target.value)}
              placeholder={t("news.titlePlaceholder")}
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="innhold">{t("news.description")}</Label>
            <Textarea
              id="innhold"
              value={innhold}
              onChange={(e) => setInnhold(e.target.value)}
              placeholder={t("news.descriptionPlaceholder")}
              rows={4}
              disabled={submitting}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="pin"
              checked={pinOnTop}
              onCheckedChange={(checked) => setPinOnTop(checked as boolean)}
              disabled={submitting}
            />
            <Label htmlFor="pin" className="cursor-pointer">
              {t("news.pinOnTop")}
            </Label>
          </div>

          {isParentCompany && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-muted-foreground" />
                <div className="space-y-0.5">
                  <Label htmlFor="visible-children">{t("news.visibleToDepartments")}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t("news.visibleToDepartmentsDesc")}
                  </p>
                </div>
              </div>
              <Switch
                id="visible-children"
                checked={visibleToChildren}
                onCheckedChange={setVisibleToChildren}
                disabled={submitting}
              />
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {t("news.cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (news ? t("news.saving") : t("news.adding")) : (news ? t("news.save") : t("news.add"))}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
