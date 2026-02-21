

# Pristilbud-fane i kalkulatoren

## Oversikt

Legge til en ny fane nederst i kalkulatoren (ved siden av oppsummeringen) som genererer et kundevendt pristilbud basert på verdiene i skjemaet. Denne viser KUN kundepriser -- ingen innkjøpskostnader, marginer eller intern informasjon.

## Implementering

### Ny Tab-struktur rundt oppsummeringen

Erstatter det navaerende oppsummerings-kortet (Section 5, linje 844-1053) med en `Tabs`-komponent som har to faner:

| Fane | Innhold |
|---|---|
| **Oppsummering** | Eksisterende intern oppsummering (uendret) |
| **Pristilbud** | Kundevendt prissammendrag uten interne kostnader |

### Innhold i Pristilbud-fanen

Pristilbudet viser kun det kunden skal betale:

- **Brukerlisens**: Antall brukere x pris per bruker/mnd (inkl. MVA)
- **Dronetag** (hvis aktivert):
  - Leasing: pris per enhet/mnd (inkl. MVA)
  - Kjop: totalpris per enhet (inkl. MVA), med eventuell nedbetalingsplan
- **Avisafe-integrasjon**: pris per Dronetag/mnd (inkl. MVA)
- **NRI Hours**: pris per time (inkl. MVA), stipulert forbruk
- **Total manedlig kostnad for kunden** (inkl. MVA)
- Eventuell engangskostnad (Dronetag hardware ved kjop)

Ingenting om innkjopspriser, avslag, marginer, nedbetalingstid for oss, eller netto overskudd.

### Valgfri kundenavn-felt

Et enkelt tekstfelt overst i pristilbud-fanen der man kan skrive kundenavn, som vises i tilbudet.

## Teknisk detaljer

### Fil som endres

| Fil | Endring |
|---|---|
| `src/components/admin/RevenueCalculator.tsx` | Wrap oppsummeringsseksjonen (linje 844-1053) i en `Tabs`-komponent. Legg til ny `TabsContent` for pristilbudet. Legg til `customerName`-state og felt i `CalcState`. |

### Kodestruktur

- Importerer `Tabs, TabsList, TabsTrigger, TabsContent` fra `@/components/ui/tabs`
- Bruker eksisterende `calc`-verdier og `state`-verdier for a beregne kundepriser
- Alt beregnes fra allerede eksisterende data -- ingen nye API-kall eller database-endringer
- `customerName` legges til i `CalcState` slik at det lagres med scenarioet

