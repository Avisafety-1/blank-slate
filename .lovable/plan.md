# Plan: Direkte åpning av PDF-sjekklister på DJI RC Pro/Plus

## Mål
Gjør PDF-sjekklister på DJI mye enklere å bruke:
- unngå «Failed to load PDF file»-opplevelsen i dialogen
- åpne PDF-en direkte automatisk på DJI RC Pro/Plus
- beholde en tydelig reserveknapp hvis autoåpning blir blokkert

## Hva jeg vil endre
1. Oppdatere `ChecklistExecutionDialog.tsx` slik at DJI-fallbacken ikke prøver å late som PDF-en skal vises inne i dialogen.
2. Når en PDF-sjekkliste åpnes på DJI, trigge automatisk åpning av den signed PDF-URL-en i ny fane/systemviser så snart fil-URL-en er klar.
3. Erstatte dagens mellomskjerm med en enkel, bevisst DJI-visning som bare sier at sjekklisten åpnes og viser én tydelig knapp: «Åpne sjekkliste».
4. Sikre at autoåpning bare skjer én gang per valgt sjekkliste, så brukeren ikke får gjentatte faner ved re-render.
5. La eksisterende moderne PDF-visning med `react-pdf` være uendret på iPad, mobil og desktop.

## Forventet resultat
- På DJI åpnes PDF-en direkte uten ekstra klikk i de fleste tilfeller.
- Hvis nettleseren ikke åpner automatisk, har brukeren fortsatt en enkel knapp for manuell åpning.
- Ingen «Failed to load PDF file»-tekst i denne flyten.
- Mindre friksjon og færre steg for piloten.

## Tekniske detaljer
- Fil: `src/components/resources/ChecklistExecutionDialog.tsx`
- Beholder `isDjiController()`-deteksjonen.
- Bruker den signed URL-en som allerede genereres fra Supabase Storage.
- Legger inn en liten guard med `useRef`/state for å unngå dobbel autoåpning per dokument.
- Endrer kun frontend-flyten for DJI-PDF; ingen database- eller backend-endringer.