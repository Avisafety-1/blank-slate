import { useEffect, useState } from "react";
import { Map } from "lucide-react";
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
  default_anonymous_publish: boolean;
  allow_pilot_override_publish_settings: boolean;
  public_company_name: string;
}

const DEFAULTS: Defaults = {
  default_publish_planned_missions: true,
  default_share_contact_info: true,
  default_anonymous_publish: false,
  allow_pilot_override_publish_settings: true,
  public_company_name: "",
};

interface Props {
  companyId: string | null;
  disabled?: boolean;
}

export function MapPublicationDefaultsCard({ companyId, disabled }: Props) {
  const [values, setValues] = useState<Defaults>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    (supabase
      .from("companies")
      .select(
        "default_publish_planned_missions, default_share_contact_info, default_anonymous_publish, allow_pilot_override_publish_settings"
      )
      .eq("id", companyId)
      .maybeSingle() as any).then(({ data }: any) => {
      if (data) {
        setValues({
          default_publish_planned_missions: data.default_publish_planned_missions ?? true,
          default_share_contact_info: data.default_share_contact_info ?? true,
          default_anonymous_publish: data.default_anonymous_publish ?? false,
          allow_pilot_override_publish_settings:
            data.allow_pilot_override_publish_settings ?? true,
        });
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
      toast({ title: "Kunne ikke lagre", description: error.message, variant: "destructive" });
      return;
    }
    invalidateCompanySettingsCache();
    toast({ title: "Lagret" });
  }

  if (loading) return null;
  const isDisabled = disabled || saving;

  return (
    <div className="rounded-lg border-2 border-primary/30 bg-muted/30 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Map className="w-4 h-4 text-primary" />
        <div>
          <div className="font-medium text-sm">Kartpublisering — standardvalg</div>
          <div className="text-xs text-muted-foreground">
            Hvordan planlagte oppdrag som standard vises på AviSafe-kartet.
          </div>
        </div>
      </div>

      <Row
        id="mp-publish"
        title="Publiser planlagt oppdrag på AviSafe-kart"
        desc="Andre AviSafe-brukere ser planlagte oppdrag fra 24t før start til slutt."
        checked={values.default_publish_planned_missions}
        disabled={isDisabled}
        onChange={(v) => update({ default_publish_planned_missions: v })}
      />
      <Row
        id="mp-share"
        title="Del kontaktinformasjon"
        desc="Navn, telefon og e-post fra oppdragseier vises i kart-popup for koordinering."
        checked={values.default_share_contact_info}
        disabled={isDisabled}
        onChange={(v) => update({ default_share_contact_info: v })}
      />
      <Row
        id="mp-anon"
        title="Anonymisert visning"
        desc="Skjul oppdragstittel, beskrivelse og kontaktinfo. Kun geometri og tid vises."
        checked={values.default_anonymous_publish}
        disabled={isDisabled}
        onChange={(v) => update({ default_anonymous_publish: v })}
      />
      <Row
        id="mp-allow-override"
        title="La pilot overstyre disse valgene per oppdrag"
        desc="Hvis av, blir feltene i oppdragsdialogen låst til selskapets standard."
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
