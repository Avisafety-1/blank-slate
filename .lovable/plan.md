# Persistent språkvalg via database (minimal, ikke-disruptiv)

## Mål
Gjør språkbytte robust ved å lagre brukerens valg i `profiles.preferred_language`. Cache i localStorage kan ikke lenger henge igjen feil. **Ingen UI-endringer**, ingen overraskelser for eksisterende brukere.

## Bevaring av eksisterende oppførsel
- Default `preferred_language = 'no'` for alle eksisterende rader → de fortsetter på norsk, akkurat som i dag.
- Hvis kolonnen er `null` (ny bruker, eller spesialtilfelle), så *gjør vi ingenting* — i18n beholder localStorage/navigator-deteksjon. Vi overstyrer **kun** når DB har en eksplisitt verdi som avviker.
- Toggle-knappen i `Header.tsx` røres ikke visuelt. Eneste tillegg: kallet til `setLanguage(...)` skriver også til DB.

## Endringer

### 1. Migrasjon
- `ALTER TABLE public.profiles ADD COLUMN preferred_language text DEFAULT 'no' CHECK (preferred_language IN ('no','en'))`.
- Ingen RLS-endring (eksisterende profil-policies dekker oppdatering av egen rad).

### 2. `src/lib/i18nHelpers.ts`
- I `setLanguage(lang)`: etter `i18n.changeLanguage(lang)`, gjør best-effort `supabase.from('profiles').update({ preferred_language: lang }).eq('user_id', currentUserId)`. Feil svelges (logges som warning) — språk-bytte i UI skal aldri blokkeres av nettverksfeil.

### 3. Hydrering ved innlogging
- I sentral auth-hook (`useAuth` / der `onAuthStateChange` lyttes på):
  - Ved `SIGNED_IN` / sesjonsoppdatering: les `profiles.preferred_language` for innlogget bruker.
  - Hvis verdien er `'no'` eller `'en'` **og** avviker fra `i18n.language` → kall `i18n.changeLanguage(...)`.
  - Hvis verdien er `null` → ikke gjør noe (bevarer dagens oppførsel for eksisterende brukere).

### 4. Lett verifiserings-logg
- `src/i18n/index.ts`: legg til `i18n.on('languageChanged', l => console.info('[i18n] Active language:', l))` (kun dev). Hjelper i feilsøking — påvirker ikke prod.

## Filer som endres
- Migrasjon (legger til kolonne med trygg default)
- `src/lib/i18nHelpers.ts`
- `src/hooks/useAuth.tsx` (eller der auth-state håndteres)
- `src/i18n/index.ts` (kun dev-logg)

## Verifisering
1. Eksisterende bruker logger inn → `preferred_language = 'no'` (default) → UI forblir på norsk. ✅
2. Bruker klikker språk-toggle → i18n bytter umiddelbart + DB oppdateres.
3. Samme bruker logger inn på ny enhet / etter cache-clear → DB-verdien `'en'` overstyrer localStorage → UI åpner på engelsk.
4. Kjør risikovurdering → edge-logg viser `Received language from client: "en"` → AI-svar på engelsk.

Ingen endringer i edge-funksjonen — EN-promptene er allerede klare og aktiveres straks `language: "en"` faktisk sendes.
