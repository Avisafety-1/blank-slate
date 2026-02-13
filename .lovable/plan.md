
# Inntekts- og kostnadskalkulator for AviSafe superadmins

## Oversikt
En ny fane i admin-panelet (kun synlig for superadmins i AviSafe-selskapet) som lar deg beregne inntekter og kostnader basert på antall brukere, bedriftsstorrelser og Dronetag/NRI-kostnader.

## Hva som lages

### Ny fane "Kalkulator" i Admin-panelet
- Vises kun for superadmins der `companyName === 'avisafe'`
- Plasseres som siste tab etter "Selskaper"
- Ikon: Calculator (fra lucide-react)

### Kalkulatorens innhold

**Seksjon 1: Bedriftsstorrelser og priser**
- Tre rader: Liten, Medium, Stor
- Hvert nivaa har felter for:
  - Maks antall brukere (grense for aa kvalifisere som liten/medium/stor)
  - Pris per bruker per maaned (NOK)

**Seksjon 2: Brukerberegning**
- Inputfelt: Totalt antall brukere i systemet
- Automatisk kategorisering basert pa grensene satt i seksjon 1
- Automatisk beregning av maanedlig totalpris

**Seksjon 3: Dronetag-kostnader**
- Innkjopskostnad per Dronetag (hva AviSafe betaler)
- Kostpris til kunde for Dronetag-integrasjon (hva kunden betaler)
- Valg: Nedbetaling (antall maaneder) eller engangskostnad
- Antall Dronetags i bruk
- Automatisk beregning av maanedlig Dronetag-kostnad

**Seksjon 4: NRI Hours**
- Innkjopspris NRI Hours (hva AviSafe betaler)
- Kostpris til kunde for NRI Hours

**Seksjon 5: Oppsummering**
- Maanedlig inntekt fra brukerlisenser
- Maanedlig inntekt fra Dronetag
- Maanedlig kostnad Dronetag
- Maanedlig kostnad NRI
- Netto maanedlig resultat

## Teknisk plan

### Nye filer
1. **`src/components/admin/RevenueCalculator.tsx`** - Hovedkomponent for kalkulatoren med all logikk og UI. Ren klientside-kalkulator uten database (kun state). Bruker eksisterende UI-komponenter: Card, Input, Label, Select.

### Endringer i eksisterende filer
1. **`src/pages/Admin.tsx`**:
   - Importer `Calculator` fra lucide-react og `RevenueCalculator`
   - Legg til ny `TabsTrigger` med value="calculator" (kun for superadmin + avisafe)
   - Legg til ny `TabsContent` som renderer `<RevenueCalculator />`
   - Oppdater `grid-cols` i TabsList for aa handtere ekstra tab

### Ingen database-endringer
Kalkulatoren er et rent beregningsverktoy. Alle verdier lagres kun i komponentens lokale state (evt. localStorage for persistens mellom sidebesok).
