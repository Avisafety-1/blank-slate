import { ExternalLink, MapPin } from "lucide-react";

export function EiendomsgrenserLegend() {
  return (
    <div className="absolute bottom-4 left-2 right-2 sm:left-4 sm:right-auto sm:w-auto sm:max-w-xs bg-background/95 backdrop-blur-sm px-3 py-2 rounded-lg shadow-lg border border-border z-[1000]">
      <div className="flex items-center gap-1.5 mb-1">
        <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
        <p className="text-[10px] sm:text-xs font-semibold text-foreground">
          Eiendomsgrenser (Matrikkelen)
        </p>
      </div>
      <p className="text-[10px] sm:text-xs text-muted-foreground leading-snug">
        Klikk i kartet for å se gnr/bnr. Bruk nummeret til å slå opp eier på Kartverkets eiendomsregister.
      </p>
      <a
        href="https://eiendomsregisteret.kartverket.no/"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1.5 inline-flex items-center gap-1 text-[10px] sm:text-xs font-medium text-primary hover:underline"
      >
        Åpne eiendomsregisteret
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}
