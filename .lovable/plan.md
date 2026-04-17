

Brukeren avviser RLS-endringen. Fra nettverksloggen ser jeg at sjekkliste-IDen `4d1c9f40-a6cf-441a-bc12-f29ffa87f758` ("Loggbok - Batteri...") faktisk **ble lagret** på oppdraget (`PATCH missions ... checklist_ids: [...]`). Brukeren KAN se dokumentet i listen (det vises i `documents`-responsen). Så SELECT på `documents` fungerer allerede.

Problemet er da i **`ChecklistExecutionDialog`** sin behandling av filen:
1. Den leser `beskrivelse` + `fil_url`
2. Hvis `beskrivelse` ikke er gyldig JSON → faller tilbake til `imageUrl` via Storage signedUrl
3. **Storage signedUrl** krever RLS-tilgang på `storage.objects` for documents-bøtten
4. Hvis filen ligger i mor-selskapets mappe (`{parent_company_id}/...`), og storage-policyen kun matcher egen `company_id`, blir signedUrl null → "Ingen punkter i sjekklisten"

I tillegg: dialogen behandler kun bilder (`<img>`), så PDF blir uansett feil rendret selv om signedUrl skulle fungere.

## Plan

### 1. Fiks `ChecklistExecutionDialog.tsx` — håndter PDF + bedre feilmelding
- Detekter MIME/extension fra `fil_url`. Hvis PDF/DOC → vis "📄 Åpne sjekkliste"-knapp som åpner filen i ny fane (samme `createSignedUrl`-flyt som `DocumentsList` allerede bruker), pluss "Marker som utført"-knapp
- Hvis bilde → vis som i dag
- Eksplisitt feilhåndtering: logg `console.error` ved Supabase-feil og vis "Kunne ikke laste sjekkliste — kontakt admin" i stedet for "Ingen punkter"

### 2. Sjekk Storage-RLS for documents-bøtten (uten å løsne den)
- Verifiser hvilke storage policies som finnes på `documents`-bøtten
- Hvis filen i mor-selskapets mappe ikke kan signeres av barne-bruker, og brukeren har lest tilgang til dokument-raden, **bør storage-policyen speile `documents`-tabellens SELECT-policy** (samme arv-regel som allerede finnes — ikke "synlig for alle"). Dette er kun en presisering, ikke en utvidelse.
- Hvis storage allerede er korrekt → kun UI-fiksen i steg 1 trengs

### 3. Verifiser
- Åpne oppdraget med checklist `4d1c9f40-...`, start flytur, sjekk at PDF-knapp + "Marker utført" vises og at filen åpnes

### Filer
- `src/components/resources/ChecklistExecutionDialog.tsx` (UI + PDF-modus)
- Eventuell migrasjon for `storage.objects` documents-policy (kun hvis verifikasjon viser at den ikke speiler tabellens SELECT)

