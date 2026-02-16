const categories = [
  { color: "#e74c3c", label: "Bolig" },
  { color: "#8e44ad", label: "Næring/Kontor" },
  { color: "#7f8c8d", label: "Industri/Lager" },
  { color: "#27ae60", label: "Fritid/Park" },
  { color: "#f39c12", label: "Offentlig" },
  { color: "#8d6e63", label: "Transport" },
];

export function ArealbrukLegend() {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-background/95 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg border border-border z-[1000]">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Arealbruk:</span>
        {categories.map((c) => (
          <div key={c.label} className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: c.color }}
            />
            <span>{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
