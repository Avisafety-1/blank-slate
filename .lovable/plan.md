## Endring i mobil-menyen (`src/components/Header.tsx`, sheet-innholdet ca. linje 181–221)

Kun mobil-menyen (hamburger-sheet) endres — desktop-nav (top bar) skal ikke røres siden brukeren ikke nevner den.

### 1. Ny rekkefølge
1. Kart
2. Oppdrag
3. Ressurser
4. Dokumenter
5. Kalender
6. Hendelser
7. Status
8. Plattformstatistikk (superadmin Avisafe)
9. Marketing (superadmin Avisafe)
10. — separator —
11. Driftstatus
12. Installer app

### 2. Ikoner på alle menyvalg
Lucide-ikoner, klasse `w-4 h-4 mr-2`:
- Kart → `Map`
- Oppdrag → `ClipboardList`
- Ressurser → `Boxes`
- Dokumenter → `FileText`
- Kalender → `Calendar`
- Hendelser → `AlertTriangle`
- Status → `Gauge`
- Plattformstatistikk → `BarChart3` (allerede)
- Marketing → `Megaphone` (allerede)
- Driftstatus → `Activity` (allerede)
- Installer app → `Download` (allerede)

### 3. Horisontal skillelinje
Legg inn `<div className="my-2 border-t border-border" />` rett over Driftstatus-knappen, slik at Driftstatus + Installer app skiller seg fra resten.

### 4. Footer i sheet-en
Etter siste knapp og før `SheetPrimitive.Close`, legg til en `mt-auto`-blokk (sheet er allerede `flex flex-col`) med liten, muted typografi:

```
© AviSafe AS
kontakt@avisafe.no  (mailto-link)
avisafe.no          (https://avisafe.no, åpner i ny fane)
```

Sentrert, `text-xs text-muted-foreground`, lenker bruker `hover:text-primary`. En tynn `border-t` over footeren.

### Det som ikke endres
- Desktop-navigasjon, dropdown-menyer, alle ruter, tilganger og `canShowModule`-betingelser beholdes uendret — kun rekkefølge, ikon-tillegg, separator og footer.
- Ingen oversettelsesnøkler endres (Driftstatus/Installer app er allerede hardkodet/oversatt slik de er i dag).