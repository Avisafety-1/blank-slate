import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Map, Info } from "lucide-react";

export interface PublicationFields {
  publish_to_map: boolean;
  share_contact_info: boolean;
  anonymous_publish: boolean;
}

interface Props {
  values: PublicationFields;
  onChange: (next: PublicationFields) => void;
  allowOverride: boolean;
}

export const MissionPublicationSection = ({ values, onChange, allowOverride }: Props) => {
  const set = (patch: Partial<PublicationFields>) => onChange({ ...values, ...patch });

  return (
    <div className="rounded-lg border border-border bg-card/50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Map className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">Kartpublisering</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Vis dette planlagte oppdraget på det interne AviSafe-kartet for koordinering med andre operatører.
      </p>

      {!allowOverride && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground rounded-md bg-muted/50 p-2">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            Selskapets administrator har låst publiseringsvalgene. Standardverdiene fra selskapet gjelder.
          </span>
        </div>
      )}

      <div className={allowOverride ? "" : "opacity-60 pointer-events-none"}>
        <div className="flex items-center justify-between py-1.5">
          <Label htmlFor="publish_to_map" className="text-sm font-normal">
            Publiser planlagt oppdrag på kart
          </Label>
          <Switch
            id="publish_to_map"
            checked={values.publish_to_map}
            onCheckedChange={(v) => set({ publish_to_map: v })}
          />
        </div>

        <div className="flex items-center justify-between py-1.5">
          <Label htmlFor="share_contact_info" className="text-sm font-normal">
            Del kontaktinfo (navn, telefon, e-post)
          </Label>
          <Switch
            id="share_contact_info"
            checked={values.share_contact_info}
            disabled={!values.publish_to_map || values.anonymous_publish}
            onCheckedChange={(v) => set({ share_contact_info: v })}
          />
        </div>

        <div className="flex items-center justify-between py-1.5">
          <Label htmlFor="anonymous_publish" className="text-sm font-normal">
            Publiser anonymt (skjul selskap og kontakt)
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
