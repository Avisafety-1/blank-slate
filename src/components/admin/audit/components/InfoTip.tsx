import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * (i) help popover. Reads `${k}.what`, `${k}.threshold`, `${k}.why`, `${k}.fix` from i18n;
 * missing parts are skipped.
 */
export const InfoTip = ({ k, label }: { k: string; label?: string }) => {
  const { t, i18n } = useTranslation();
  const parts = (["what", "threshold", "why", "fix"] as const).filter((p) => i18n.exists(`${k}.${p}`));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          aria-label={label ?? t("audit.help.open")}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 max-w-[90vw] max-h-[60vh] overflow-y-auto overscroll-contain [touch-action:pan-y] text-sm space-y-2"
        onClick={(e) => e.stopPropagation()}
      >
        {parts.map((p) => (
          <div key={p}>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t(`audit.help.labels.${p}`)}</div>
            <div className="leading-snug">{t(`${k}.${p}`)}</div>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
};
