import { useEffect, useState } from "react";
import { Map } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { invalidateCompanySettingsCache } from "@/hooks/useCompanySettings";

interface Defaults {
  default_publish_planned_missions: boolean;
  default_share_contact_info: boolean;
  default_share_contact_name: boolean;
  default_share_contact_phone: boolean;
  default_share_contact_email: boolean;
  default_anonymous_publish: boolean;
  allow_pilot_override_publish_settings: boolean;
  public_company_name: string;
}

const DEFAULTS: Defaults = {
  default_publish_planned_missions: true,
  default_share_contact_info: true,
  default_share_contact_name: true,
  default_share_contact_phone: true,
  default_share_contact_email: true,
  default_anonymous_publish: false,
  allow_pilot_override_publish_settings: true,
  public_company_name: "",
};

interface Props {
  companyId: string | null;
  disabled?: boolean;
}

export function MapPublicationDefaultsCard({ companyId, disabled }: Props) {
  const { t } = useTranslation();
  const [values, setValues] = useState<Defaults>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isRoot, setIsRoot] = useState(true);
  const [nameDraft, setNameDraft] = useState("");

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    (supabase
      .from("companies")
      .select(
        "default_publish_planned_missions, default_share_contact_info, default_share_contact_name, default_share_contact_phone, default_share_contact_email, default_anonymous_publish, allow_pilot_override_publish_settings, public_company_name, parent_company_id"
      )
      .eq("id", companyId)
      .maybeSingle() as any).then(({ data }: any) => {
      if (data) {
        setValues({
          default_publish_planned_missions: data.default_publish_planned_missions ?? true,
          default_share_contact_info: data.default_share_contact_info ?? true,
          default_share_contact_name: data.default_share_contact_name ?? true,
          default_share_contact_phone: data.default_share_contact_phone ?? true,
          default_share_contact_email: data.default_share_contact_email ?? true,
          default_anonymous_publish: data.default_anonymous_publish ?? false,
          allow_pilot_override_publish_settings:
            data.allow_pilot_override_publish_settings ?? true,
          public_company_name: data.public_company_name ?? "",
        });
        setIsRoot(!data.parent_company_id);
        setNameDraft(data.public_company_name ?? "");
      }
      setLoading(false);
    });
  }, [companyId]);

  async function update(patch: Partial<Defaults>) {
    if (!companyId) return;
    const next = { ...values, ...patch };
    setValues(next);
    setSaving(true);
    const { error } = await (supabase
      .from("companies")
      .update(patch as any)
      .eq("id", companyId) as any);
    setSaving(false);
    if (error) {
      toast({ title: t("mapPublication.saveFailed"), description: error.message, variant: "destructive" });
      return;
    }
    invalidateCompanySettingsCache();
    toast({ title: t("mapPublication.saved") });
  }

  if (loading) return null;
  const isDisabled = disabled || saving;

  return (
    <div className="rounded-lg border-2 border-primary/30 bg-muted/30 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Map className="w-4 h-4 text-primary" />
        <div>
          <div className="font-medium text-sm">{t("mapPublication.title")}</div>
          <div className="text-xs text-muted-foreground">
            {t("mapPublication.subtitle")}
          </div>
        </div>
      </div>

      <div className="pt-2 border-t border-border/50 space-y-2">
        <Label htmlFor="public-company-name" className="text-sm font-medium">
          {t("mapPublication.publicCompanyName")}
        </Label>
        <p className="text-xs text-muted-foreground">
          {t("mapPublication.publicCompanyDesc")}
          {!isRoot && t("mapPublication.publicCompanyDescChild")}
        </p>
        <div className="flex gap-2">
          <Input
            id="public-company-name"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            placeholder={t("mapPublication.publicCompanyPlaceholder")}
            disabled={isDisabled}
          />
          <Button
            type="button"
            size="sm"
            disabled={isDisabled || nameDraft === values.public_company_name}
            onClick={() => update({ public_company_name: nameDraft.trim() })}
          >
            {t("mapPublication.save")}
          </Button>
        </div>
      </div>

      <Row
        id="mp-publish"
        title={t("mapPublication.publishTitle")}
        desc={t("mapPublication.publishDesc")}
        checked={values.default_publish_planned_missions}
        disabled={isDisabled}
        onChange={(v) => update({ default_publish_planned_missions: v })}
      />
      <Row
        id="mp-share"
        title={t("mapPublication.shareTitle")}
        desc={t("mapPublication.shareDesc")}
        checked={values.default_share_contact_info}
        disabled={isDisabled}
        onChange={(v) => update({ default_share_contact_info: v })}
      />
      {values.default_share_contact_info && (
        <div className="ml-4 pl-3 border-l-2 border-primary/30 space-y-1">
          <Row
            id="mp-share-name"
            title={t("mapPublication.shareNameTitle")}
            desc={t("mapPublication.shareNameDesc")}
            checked={values.default_share_contact_name}
            disabled={isDisabled}
            onChange={(v) => update({ default_share_contact_name: v })}
          />
          <Row
            id="mp-share-phone"
            title={t("mapPublication.sharePhoneTitle")}
            desc={t("mapPublication.sharePhoneDesc")}
            checked={values.default_share_contact_phone}
            disabled={isDisabled}
            onChange={(v) => update({ default_share_contact_phone: v })}
          />
          <Row
            id="mp-share-email"
            title={t("mapPublication.shareEmailTitle")}
            desc={t("mapPublication.shareEmailDesc")}
            checked={values.default_share_contact_email}
            disabled={isDisabled}
            onChange={(v) => update({ default_share_contact_email: v })}
          />
        </div>
      )}
      <Row
        id="mp-anon"
        title={t("mapPublication.anonTitle")}
        desc={t("mapPublication.anonDesc")}
        checked={values.default_anonymous_publish}
        disabled={isDisabled}
        onChange={(v) => update({ default_anonymous_publish: v })}
      />
      <Row
        id="mp-allow-override"
        title={t("mapPublication.overrideTitle")}
        desc={t("mapPublication.overrideDesc")}
        checked={values.allow_pilot_override_publish_settings}
        disabled={isDisabled}
        onChange={(v) => update({ allow_pilot_override_publish_settings: v })}
      />
    </div>
  );
}

function Row({
  id,
  title,
  desc,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  title: string;
  desc: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 pt-2 border-t border-border/50">
      <Label htmlFor={id} className="flex-1 cursor-pointer">
        <div className="font-medium text-sm">{title}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
