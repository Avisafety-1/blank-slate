

## Fix: Skjerm blinker og kaster tilbake ved bildevalg på Samsung

### Problem
Fil-input har `capture="environment"` (linje 242). På Android/Samsung tvinger dette kameraet til å åpne direkte. Når systemet bytter kontekst til kamera-appen, kan nettleseren miste fokus og dialogen lukkes via `onOpenChange(false)`, som sender brukeren tilbake til /ressurser.

### Løsning
Fjern `capture="environment"` fra fil-inputen. Brukeren får fortsatt valget mellom kamera og filer via Android sin standard filvelger-dialog, men uten tvungen kameramodus som forårsaker kontekstbyttet.

### Endring
**`src/components/resources/AddCompetencyDialog.tsx`** — linje 242: fjern `capture="environment"`

