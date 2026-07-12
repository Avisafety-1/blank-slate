import { useTranslation } from "react-i18next";

export function TettstederLegend() {
  const { t } = useTranslation();
  const categories = [
    { color: "#e31a1c", label: t("safety.tettstederLegend.tettbygd") },
    { color: "transparent", label: t("safety.tettstederLegend.spredtbygd"), border: true },
  ];
  return (
    <div className="absolute bottom-4 left-2 right-2 sm:left-auto sm:right-4 sm:w-auto bg-background/95 backdrop-blur-sm px-3 py-2 rounded-lg shadow-lg border border-border z-[1000]">
      <p className="text-[10px] sm:text-xs font-semibold text-foreground mb-1.5">
        {t("safety.tettstederLegend.title")}
      </p>
      <div className="flex flex-col gap-1">
        {categories.map((c) => (
          <div key={c.label} className="flex items-center gap-2">
            <span
              className="inline-block w-4 h-3 shrink-0 rounded-sm border border-black/20"
              style={{ backgroundColor: c.color }}
            />
            <span className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap">
              {c.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
