# Robust språkbytte — fix race med AuthContext

## Problem

Konsoll-loggen viser at `i18n.language === 'no'` på samme tidspunkt som AI-kallet kjører, selv om brukeren har togglet til EN. Resultat: edge-funksjonen får `language: "no"` og svarer på norsk.

Rot­årsak: `AuthContext` re-hydrerer i18n fra `profiles.preferred_language` på *hver* profil-fetch (SIGNED_IN, TOKEN_REFRESHED, selskaps­bytte). Hvis en slik fetch lander rett etter en toggle — før DB-skrivingen har commitet, eller før profil-cachen er invalidert — leses gammel verdi `no` og overstyrer brukerens `en`-valg.

## Endringer (kun frontend)

### 1. `src/contexts/AuthContext.tsx` — hydrér KUN én gang per session

- Legg til en `useRef<boolean>(false)` `i18nHydratedRef`.
- I blokken som leser `preferred_language` (linje ~553-564): bare kall `i18n.changeLanguage(preferred)` hvis `i18nHydratedRef.current === false`. Sett flagget til `true` etter første hydrering.
- Nullstill flagget i `onAuthStateChange` ved `SIGNED_OUT` (så ny innlogging hydrerer på nytt).
- Resultat: påfølgende profil-refresher rører ikke i18n. Brukerens toggle vinner alltid mid-session.

### 2. `src/lib/i18nHelpers.ts` — vent på DB-skriving + tydelig logging

- I `setLanguage`: behold rekkefølgen (changeLanguage først for umiddelbar UI-respons), men la DB-skrivingen være `await`-et og logg utfallet eksplisitt:
  - Suksess: `console.info('[i18n] Persisted preferred_language=', lang)`
  - Feil/ingen bruker: `console.warn(...)`
- Ingen funksjonell endring for ikke-innloggede brukere.

### 3. `src/components/Header.tsx` — await toggle

- Endre `toggleLanguage` til `async` og `await setLanguage(newLang)`. Dette sikrer at hvis noe (toast, navigasjon, AI-kall) skjer rett etter, så er DB-skrivingen ferdig.

## Verifisering

1. Logg inn, observer i konsoll: `[i18n] Active language on init: no` + (hvis DB har `no`) `[i18n] Active language changed to: no` fra AuthContext-hydrering.
2. Klikk toggle → forventet:
   - `[i18n] Active language changed to: en`
   - `[i18n] Persisted preferred_language= en`
3. Trigg en token-refresh (vent, eller bytt fane) → AuthContext skal IKKE lenger logge `Active language changed to: ...` (hydrering hoppes over).
4. Kjør risk assessment → edge-loggen skal vise `Received language from client: "en"` og svaret skal være på engelsk.

## Bevaring av eksisterende oppførsel

- Eksisterende brukere uten toggle-handling: AuthContext hydrerer fortsatt fra DB ved første innlogging (default `no`) → ingen synlig endring.
- Ingen migrasjon, ingen edge-function-endring, ingen oversettelses­endring.
