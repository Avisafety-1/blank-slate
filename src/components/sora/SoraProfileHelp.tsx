import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

/**
 * "Slik fungerer SORA-profiler" help collapsible, shared by the profile list
 * (company settings + /sora-profiler) and the SORA profile dialog.
 * Open/closed state is remembered per user in localStorage.
 */
export function SoraProfileHelp() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const storageKey = `avisafe:sora-profile-help:${user?.id ?? "anonymous"}`;
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(storageKey) === "open"; } catch { return false; }
  });
  useEffect(() => {
    try { setOpen(localStorage.getItem(storageKey) === "open"); } catch { setOpen(false); }
  }, [storageKey]);
  const setOpenPersisted = (next: boolean) => {
    setOpen(next);
    try { localStorage.setItem(storageKey, next ? "open" : "closed"); } catch { /* storage may be unavailable */ }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpenPersisted} className="rounded-md border border-border bg-muted/20">
      <CollapsibleTrigger asChild>
        <Button type="button" variant="ghost" className="h-auto w-full justify-start gap-2 px-3 py-3 text-left">
          <Info className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 font-medium">{t("soraProfile.help.title")}</span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-border px-4 py-4">
        <ol className="space-y-3 text-sm">
          {[1, 2, 3, 4, 5].map((step) => (
            <li key={step} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{step}</span>
              <p className="min-w-0 break-words"><strong>{t(`soraProfile.help.steps.${step}.title`)}</strong> — {t(`soraProfile.help.steps.${step}.body`)}</p>
            </li>
          ))}
        </ol>
        <div className="mt-5 space-y-2 text-sm">
          <h3 className="font-semibold">{t("soraProfile.help.assessmentTitle")}</h3>
          <ul className="list-disc space-y-2 pl-5">
            {[1, 2, 3, 4].map((item) => <li key={item}>{t(`soraProfile.help.assessment.${item}`)}</li>)}
          </ul>
        </div>
        <p className="mt-4 text-sm"><strong>{t("soraProfile.help.departmentsTitle")}:</strong> {t("soraProfile.help.departmentsBody")}</p>
        <p className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          <strong>{t("soraProfile.help.importantTitle")}:</strong> {t("soraProfile.help.importantBody")}
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}
