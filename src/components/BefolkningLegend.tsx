import { useTranslation } from "react-i18next";

interface BefolkningLegendProps {
  resolution?: "1km" | "250m";
  source?: "ssb" | "eurostat" | "both";
}

export function BefolkningLegend({ resolution = "1km", source = "both" }: BefolkningLegendProps) {
  const { t } = useTranslation();
  const categories = [
    { color: "#ffffb2", label: t("safety.befolkningLegend.range1") },
    { color: "#fecc5c", label: t("safety.befolkningLegend.range2") },
    { color: "#fd8d3c", label: t("safety.befolkningLegend.range3") },
    { color: "#f03b20", label: t("safety.befolkningLegend.range4") },
    { color: "#bd0026", label: t("safety.befolkningLegend.range5") },
    { color: "#800026", label: t("safety.befolkningLegend.range6") },
    { color: "#400010", label: t("safety.befolkningLegend.range7") },
  ];
  const headerSuffix =
    resolution === "250m"
      ? t("safety.befolkningLegend.suffix250m")
      : source === "ssb" ? t("safety.befolkningLegend.suffixSsb1km")
      : source === "eurostat" ? t("safety.befolkningLegend.suffixEurostat")
      : t("safety.befolkningLegend.suffixBoth");
  const subtitle =
    resolution === "250m"
      ? t("safety.befolkningLegend.subtitle250m")
      : source === "ssb" ? t("safety.befolkningLegend.subtitleSsb")
      : source === "eurostat" ? t("safety.befolkningLegend.subtitleEurostat")
      : t("safety.befolkningLegend.subtitleBoth");
  return (
    <div className="absolute bottom-4 left-2 right-2 sm:left-auto sm:right-4 sm:w-auto bg-background/95 backdrop-blur-sm px-3 py-2 rounded-lg shadow-lg border border-border z-[1000]">
      <p className="text-[10px] sm:text-xs font-semibold text-foreground mb-1.5">
        {t("safety.befolkningLegend.title", { suffix: headerSuffix })}
      </p>
      <p className="text-[10px] text-muted-foreground mb-1.5">{subtitle}</p>
      <div className="flex flex-col gap-1">
        {categories.map((c) => (
          <div key={c.label} className="flex items-center gap-2">
            <span
              className="inline-block w-4 h-3 shrink-0 rounded-sm border border-black/10"
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
