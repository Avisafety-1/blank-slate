import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useSoraProfile, type SoraProfileStatus } from "@/hooks/useSoraProfile";
import { SoraProfileDialog } from "./SoraProfileDialog";

const STATUS_CLASS: Record<SoraProfileStatus, string> = {
  none: "bg-muted/60 border-border text-muted-foreground",
  draft: "bg-amber-500/15 border-amber-500/50 text-amber-700 dark:text-amber-300",
  confirmed: "bg-emerald-500/15 border-emerald-500/50 text-emerald-700 dark:text-emerald-300",
  outdated: "bg-destructive/10 border-destructive/50 text-destructive",
};

export const soraStatusClass = (status: SoraProfileStatus) => STATUS_CLASS[status];

interface Props {
  documentId: string | null | undefined;
  readOnly?: boolean;
  className?: string;
  statusOverride?: SoraProfileStatus;
}

/** Small status chip for a SORA document's profile; opens the profile dialog on click. */
export function SoraProfileBadge({ documentId, readOnly, className, statusOverride }: Props) {
  const { t } = useTranslation();
  const { status } = useSoraProfile(documentId);
  const displayedStatus = statusOverride ?? status;
  const [open, setOpen] = useState(false);
  if (!documentId) return null;
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
        className={cn(
          "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap hover:bg-muted/50",
          STATUS_CLASS[displayedStatus],
          className,
        )}
        title={`${t("soraProfile.title")} — ${t(`soraProfile.status.${displayedStatus}`)}`}
      >
        {t(`soraProfile.status.${displayedStatus}`)}
      </button>
      {open && (
        // Clicks inside the dialog must not bubble to clickable parents (e.g. the
        // document badge in MissionTypesSection, which opens the document picker).
        <span onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <SoraProfileDialog documentId={documentId} open={open} onOpenChange={setOpen} readOnly={readOnly} />
        </span>
      )}
    </>
  );
}
