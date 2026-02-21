

# Fiks Pristilbud-fane og legg til nye funksjoner

## Problem

Tabs-komponenten ble importert men aldri brukt i JSX-en. Oppsummeringskortet (linje 848-1056) er fortsatt en vanlig Card uten faner.

## Endringer

### 1. Wrap oppsummeringen i Tabs

Inne i det eksisterende Card-elementet (linje 855, CardContent), legger vi til en Tabs-komponent med to faner:
- **Oppsummering** -- eksisterende intern oversikt (uendret)
- **Pristilbud** -- kundevendt prissammendrag

### 2. Nytt state-felt: `quoteSavedDate`

Legges til i `CalcState` som `quoteSavedDate: string | null`. Settes til dagens dato (lokal, ikke UTC) nar lagre-knappen trykkes. Brukes til a vise "Pristilbud gyldig i 14 dager fra [dato]".

### 3. Pristilbud-fanen viser

**Topp:**
- "Pristilbud gyldig i 14 dager fra DD.MM.YYYY" (basert pa `quoteSavedDate`, eller "ikke lagret enna" om null)
- Kundenavn-felt (tekstinput, lagres i `state.customerName`)

**Selskapsstorrelse og prismodell:**
- Viser ALLE tre tier-nivaer som en tabell:

| Selskapsstorrelse | Maks brukere | Pris per bruker/mnd (inkl. MVA) |
|---|---|---|
| Liten | Opptil 5 | 299 x 1.25 = 373,75 NOK |
| Medium | Opptil 15 | 249 x 1.25 = 311,25 NOK |
| Stor | Over 15 | 199 x 1.25 = 248,75 NOK |

- Markerer gjeldende tier basert pa antall brukere valgt
- Forklarende tekst: "En automatisk beregning basert pa brukere i systemet blir gjort"

**Prisdetaljer for dette scenarioet:**
- Brukerlisens: antall x pris inkl. MVA
- Dronetag (leasing eller kjop, avhengig av valgt modus) inkl. MVA
- Avisafe-integrasjon inkl. MVA
- NRI Hours inkl. MVA
- **Total manedlig kostnad inkl. MVA**
- Eventuell engangskostnad for Dronetag hardware

Ingen innkjopskostnader, marginer eller intern info.

## Tekniske detaljer

### Fil som endres

| Fil | Endring |
|---|---|
| `src/components/admin/RevenueCalculator.tsx` | Legg til `quoteSavedDate` i CalcState og defaultCalcState. Sett `quoteSavedDate` i saveToDatabase-funksjonen. Wrap CardContent innhold (linje 856-1054) i Tabs. Legg til pristilbud TabsContent. |

### quoteSavedDate logikk
- Lagres som string i format "YYYY-MM-DD" (lokal dato)
- Settes med: `const d = new Date(); const dateStr = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');`
- Vises som DD.MM.YYYY i pristilbudet
- Gyldighet beregnes ved a legge til 14 dager

