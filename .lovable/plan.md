

## Fix: "Failed to fetch" kun på Samsung mobil

### Diagnose

Edge function-loggene viser **ingen innkommende requests** fra Samsung. Det betyr at forespørselen aldri forlater enheten. Feilen skjer på både preview og published, men kun på Samsung (ikke iPad). Dette peker mot en Samsung-spesifikk klient-side blokkering.

Sannsynlig årsak: Appen bruker direkte `fetch()` med manuell URL-konstruksjon og header-setting for å kalle edge functions. På Samsung (spesielt i PWA-modus eller Samsung Internet) kan dette blokkeres av:
- Gammel/stale service worker som cachéer feil
- Samsung Internets innebygde tracker-blokkering som fanger opp cross-origin POST til `.supabase.co`
- FormData-håndtering som oppfører seg annerledes på Android vs iOS

### Løsning

Bytte alle manuelle `fetch()`-kall mot edge functions til `supabase.functions.invoke()`. Dette:
- Bruker Supabase-klientens innebygde fetch-wrapper (med retry-logikk)
- Håndterer auth-headers automatisk
- Konstruerer URL riktig via klienten
- Fungerer med FormData som body-parameter

### Endringer i `src/components/UploadDroneLogDialog.tsx`

**1. `handleUpload` (linje 638-685)**
Erstatt:
```ts
const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const formData = new FormData();
formData.append('file', file);
const response = await fetchWithRetry(`https://${projectId}.supabase.co/functions/v1/${endpoint}`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${session.access_token}` },
  body: formData,
});
```
Med:
```ts
const formData = new FormData();
formData.append('file', file);
const { data, error } = await supabase.functions.invoke(endpoint, { body: formData });
if (error) throw error;
const result: DroneLogResult = data;
```

**2. `handleBulkUpload` (linje 691-809)**
Samme endring: bytt direkte fetch med `supabase.functions.invoke(bulkEndpoint, { body: formData })`.

**3. `callDronelogAction` (linje 166-190)**
Erstatt manuell fetch med:
```ts
const { data, error } = await supabase.functions.invoke('process-dronelog', {
  body: { action, ...payload },
});
if (error) throw error;
return data;
```

**4. `handleSelectPendingLog` (linje 1095-1130)**
Erstatt manuell fetch til `dji-process-single` med `supabase.functions.invoke('dji-process-single', { body: { pending_log_id } })`.

**5. Fjern `fetchWithRetry`-hjelperen** (linje 617-636) da den ikke lenger trengs. Supabase-klientens fetch-wrapper i `client.ts` håndterer allerede 401-retry.

### Filer som endres

| Fil | Endring |
|-----|---------|
| `src/components/UploadDroneLogDialog.tsx` | Bytt 4 manuelle fetch-kall til `supabase.functions.invoke()`, fjern `fetchWithRetry` |

### Forventet resultat
- Edge function-kall bruker Supabase-klientens robuste transportlag
- Samsung-spesifikke problemer med manuell cross-origin fetch unngås
- DJI-logikk forblir funksjonelt uendret
- Eksisterende retry-logikk i `client.ts` gjelder automatisk

