import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Map, Info } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface PublicationFields {
  publish_to_map: boolean;
  share_contact_info: boolean;
  anonymous_publish: boolean;
}

interface Props {
  values: PublicationFields;
  onChange: (next: PublicationFields) => void;
  allowOverride: boolean;
  shareName?: boolean;
  sharePhone?: boolean;
  shareEmail?: boolean;
}

export const MissionPublicationSection = ({
  values,
  onChange,
  allowOverride,
  shareName = true,
  sharePhone = true,
  shareEmail = true,
}: Props) => {
  const { t } = useTranslation();
  const set = (patch: Partial<PublicationFields>) => onChange({ ...values, ...patch });

  const sharedFields: string[] = [];
  if (shareName) sharedFields.push(t('dashboard.publication.fieldName'));
  if (sharePhone) sharedFields.push(t('dashboard.publication.fieldPhone'));
  if (shareEmail) sharedFields.push(t('dashboard.publication.fieldEmail'));
  const adminSharesNothing = sharedFields.length === 0;
  const sharedLabel = adminSharesNothing
    ? t('dashboard.publication.shareContact')
    : t('dashboard.publication.shareContactWith', { fields: sharedFields.join(", ") });

  return (
    <div className="rounded-lg border border-border bg-card/50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Map className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">{t('dashboard.publication.title')}</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        {t('dashboard.publication.description')}
      </p>

      {!allowOverride && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground rounded-md bg-muted/50 p-2">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            {t('dashboard.publication.lockedNote')}
          </span>
        </div>
      )}

      <div className={allowOverride ? "" : "opacity-60 pointer-events-none"}>
        <div className="flex items-center justify-between py-1.5">
          <Label htmlFor="publish_to_map" className="text-sm font-normal">
            {t('dashboard.publication.publishToMap')}
          </Label>
          <Switch
            id="publish_to_map"
            checked={values.publish_to_map}
            onCheckedChange={(v) => set({ publish_to_map: v })}
          />
        </div>

        <div className="py-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="share_contact_info" className="text-sm font-normal">
              {sharedLabel}
            </Label>
            <Switch
              id="share_contact_info"
              checked={values.share_contact_info && !adminSharesNothing}
              disabled={!values.publish_to_map || values.anonymous_publish || adminSharesNothing}
              onCheckedChange={(v) => set({ share_contact_info: v })}
            />
          </div>
          {adminSharesNothing && (
            <p className="text-xs text-muted-foreground mt-1">
              {t('dashboard.publication.adminSharesNothing')}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between py-1.5">
          <Label htmlFor="anonymous_publish" className="text-sm font-normal">
            {t('dashboard.publication.anonymous')}
          </Label>
          <Switch
            id="anonymous_publish"
            checked={values.anonymous_publish}
            disabled={!values.publish_to_map}
            onCheckedChange={(v) => set({ anonymous_publish: v })}
          />
        </div>
      </div>
    </div>
  );
};
