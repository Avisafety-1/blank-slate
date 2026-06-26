Flytt Mine/Alle-fanene opp på samme rad som tittel "Kommende oppdrag", mellom tittelen og handlingsknappene (FileText + Plus).

I `src/components/dashboard/MissionsSection.tsx`:
- Fjern den separate `<Tabs>`-blokken under header
- Plasser `<TabsList>` inline i header-raden, mellom tittel-divet og knappe-divet
- Komprimer TabsList (auto-bredde, h-7, mindre padding) så den passer ved siden av tittelen
- Behold filter-logikk og tellinger uendret