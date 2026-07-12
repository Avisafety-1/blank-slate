import { useTranslation } from "react-i18next";

export function ArealbrukLegend() {
  const { t } = useTranslation();
  const categories = [
    { color: "#e74c3c", label: t("safety.arealbrukLegend.bolig") },
    { color: "#8e44ad", label: t("safety.arealbrukLegend.naeringKontor") },
    { color: "#7f8c8d", label: t("safety.arealbrukLegend.industriLager") },
    { color: "#27ae60", label: t("safety.arealbrukLegend.fritidPark") },
    { color: "#f39c12", label: t("safety.arealbrukLegend.offentlig") },
    { color: "#8d6e63", label: t("safety.arealbrukLegend.transport") },
  ];

  return (
    <div className="absolute bottom-4 left-2 right-2 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-auto bg-background/95 backdrop-blur-sm px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg shadow-lg border border-border z-[1000]">
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 sm:gap-4 text-[10px] sm:text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{t("safety.arealbrukLegend.title")}</span>
        {categories.map((c) => (
          <div key={c.label} className="flex items-center gap-1">
            <span
              className="inline-block w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full shrink-0"
              style={{ backgroundColor: c.color }}
            />
            <span>{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
