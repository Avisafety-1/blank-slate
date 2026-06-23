## Endring

Mobil-visning av oppdragsdialogen scroller horisontalt. To justeringer:

### 1. `src/components/dashboard/MissionResourceSections.tsx` (drone-liste)
Vis serienummeret på egen linje under modellnavnet i stedet for samme linje, så lange modell+SN-strenger ikke pusher bredden.

```tsx
<li key={d.drone_id}>
  <div>{d.drones?.modell || "Ukjent"}</div>
  {d.drones?.serienummer && (
    <div className="text-sm text-muted-foreground">{d.drones.serienummer}</div>
  )}
</li>
```

### 2. `src/components/dashboard/MissionDetailDialog.tsx` (flylogg-kort, ~linje 374–451)
Pakk knappene mer kompakt på mobil:
- Endre rad-container fra `flex items-center justify-between` til layout som tillater wrap: bytt `gap-1`-knappe-blokken til `flex flex-col gap-1 items-end` på mobil, og legg GPX+KMZ i en undergruppe `flex flex-col gap-1` så de stables vertikalt. Analyser-knappen blir stående ved siden av.
- Konkret: knappe-wrapperen (linje 387) blir `<div className="flex items-center gap-1 shrink-0">` med to barn: `Analyser`-knapp og en ny `<div className="flex flex-col gap-1">` rundt GPX og KMZ.
- Legg `min-w-0` på tekst-kolonnen (linje 377) så datoen kan brytes uten å presse layouten.
- Legg `overflow-hidden` på kort-containeren (linje 376) for å hindre at noe stikker ut.

Ingen logikk-/data-endring; rent CSS/JSX-omstrukturering for mobil.
