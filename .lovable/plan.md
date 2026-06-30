## Problem
Dokumentdialogen på `/dokumenter` (`DocumentCardModal.tsx`) presses utenfor mobilskjermen. Årsaken er at `DialogContent` bruker `max-w-2xl` uten en eksplisitt mobilbredde-cap, og at "Eksisterende fil ({langt_filnavn})"-spanen ikke bryter lange filnavn — så den utvider flex-raden og dermed dialogen.

## Endringer (kun `src/components/documents/DocumentCardModal.tsx`)

1. **DialogContent (linje 403)**: Legg til mobil-bredde-cap som matcher fixen i `DocumentDetailDialog`:
   `className="max-w-2xl w-[calc(100vw-2rem)] sm:w-full max-h-[90vh] overflow-y-auto"`

2. **"Eksisterende fil"-rad (linje 676–689)**: La filnavnet brytes og knappen ikke krympes bort:
   - Bytt ytre `flex items-center gap-2` til `flex flex-wrap items-center gap-2`
   - Legg `break-all min-w-0` på `<span>Eksisterende fil ({document.fil_navn || "fil"}):</span>`

3. **"Eksisterende URL"-rad (linje 622–633)**: Samme behandling — `flex-wrap` + `break-all` på span — så lange URLer ikke utvider dialogen.

4. **DialogFooter (linje 742)**: Legg til `flex-col sm:flex-row` så Slett/Avbryt/Lagre-knappene stables på mobil i stedet for å presse bredden.

Ingen logikkendringer; kun layout/wrap-klasser.