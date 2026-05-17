const categories = [
  { color: "#ffffb2", label: "1–9 bosatte per km²" },
  { color: "#fecc5c", label: "10–19 bosatte per km²" },
  { color: "#fd8d3c", label: "20–99 bosatte per km²" },
  { color: "#f03b20", label: "100–499 bosatte per km²" },
  { color: "#bd0026", label: "500–1 999 bosatte per km²" },
  { color: "#800026", label: "2 000–4 999 bosatte per km²" },
  { color: "#400010", label: "5 000 eller flere bosatte per km²" },
];

interface BefolkningLegendProps {
  resolution?: "1km" | "250m";
  source?: "ssb" | "eurostat" | "both";
}

export function BefolkningLegend({ resolution = "1km", source = "both" }: BefolkningLegendProps) {
  const headerSuffix =
    resolution === "250m"
      ? "(SSB 250 m)"
      : source === "ssb" ? "(SSB 1 km)"
      : source === "eurostat" ? "(Eurostat 2021, 1 km)"
      : "(SSB 1 km / Eurostat 2021)";
  const subtitle =
    resolution === "250m"
      ? "Risikovurdering bruker 250 m-ruter × 16."
      : source === "ssb" ? "Kilde: SSB (kun Norge)"
      : source === "eurostat" ? "Kilde: Eurostat GISCO Census 2021"
      : "Norge: SSB · Europa: Eurostat GISCO (Census 2021)";
  return (
    <div className="absolute bottom-4 left-2 right-2 sm:left-auto sm:right-4 sm:w-auto bg-background/95 backdrop-blur-sm px-3 py-2 rounded-lg shadow-lg border border-border z-[1000]">
      <p className="text-[10px] sm:text-xs font-semibold text-foreground mb-1.5">
        Befolkning per km² {headerSuffix}
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
