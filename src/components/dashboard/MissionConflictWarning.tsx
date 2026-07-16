import { AlertTriangle, Phone, Mail } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { format } from "date-fns";
import { nb, enGB } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import type { MissionMapConflict } from "@/hooks/useMissionMapConflicts";

interface Props {
  conflicts: MissionMapConflict[];
}

const fmt = (iso: string | null) => {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "dd.MM HH:mm", { locale: nb });
  } catch {
    return "—";
  }
};

export const MissionConflictWarning = ({ conflicts }: Props) => {
  if (!conflicts.length) return null;

  const visible = conflicts.slice(0, 5);
  const extra = conflicts.length - visible.length;

  return (
    <Alert className="border-amber-500/50 bg-amber-500/5 text-foreground">
      <AlertTriangle className="h-4 w-4 text-amber-500" />
      <AlertTitle className="text-amber-700 dark:text-amber-400">
        Mulig konflikt med planlagt oppdrag
      </AlertTitle>
      <AlertDescription className="space-y-2 mt-2">
        <p className="text-xs text-muted-foreground">
          Andre operatører har publisert {conflicts.length === 1 ? "et oppdrag" : `${conflicts.length} oppdrag`} som
          overlapper i tid og område. Du kan fortsatt lagre — varselet er informativt.
        </p>
        <ul className="space-y-1.5">
          {visible.map((c) => {
            const showContact =
              !c.anonymous_publish &&
              (c.public_contact_phone || c.public_contact_email);
            return (
              <li
                key={c.mission_id}
                className="rounded-md border border-amber-500/20 bg-background/50 p-2 text-xs"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {c.anonymous_publish
                      ? "Anonymt publisert oppdrag"
                      : c.public_title || "Planlagt oppdrag"}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {fmt(c.starts_at)}
                    {c.ends_at ? ` – ${fmt(c.ends_at)}` : ""}
                  </span>
                </div>
                {c.anonymous_publish ? (
                  <p className="text-muted-foreground mt-1">
                    Operatør har valgt anonym publisering.
                  </p>
                ) : showContact ? (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {c.public_contact_name && (
                      <span className="text-muted-foreground">{c.public_contact_name}</span>
                    )}
                    {c.public_contact_phone && (
                      <a
                        href={`tel:${c.public_contact_phone}`}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <Phone className="h-3 w-3" />
                        {c.public_contact_phone}
                      </a>
                    )}
                    {c.public_contact_email && (
                      <a
                        href={`mailto:${c.public_contact_email}`}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <Mail className="h-3 w-3" />
                        {c.public_contact_email}
                      </a>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        {extra > 0 && (
          <p className="text-xs text-muted-foreground">+{extra} flere</p>
        )}
      </AlertDescription>
    </Alert>
  );
};
