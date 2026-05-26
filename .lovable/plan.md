# Tydelig språkvelger som faktisk speiler DB

## Diagnose

- DB-skriving fungerer: `profiles.preferred_language` ble oppdatert til `'no'` kl 18:32 av innlogget bruker. RLS og `setLanguage()` virker som forventet.
- Edge-funksjonen `ai-risk-assessment` mottar `language`-feltet fra klienten og bruker `getPrompts(language)`. AI-svar er på norsk fordi klienten faktisk sender `'no'`.
- Rotårsak er UI: dagens toggle er kun et globus-ikon. Brukeren ser ikke hvilket språk som er aktivt og kan ikke vite at et klikk faktisk byttet retning. Ingen toast bekrefter heller resultatet. Resultatet er at man tror man bytter til engelsk, men ender opp på norsk.

## Endringer (kun frontend)

### 1. `src/components/Header.tsx` — segmentert språkvelger

Erstatt dagens enkelt-knapp (mobil + desktop) med en segmentert kontroll som viser begge språk og merker det aktive:

```
[ NO | EN ]
```

- Aktivt segment: `bg-primary text-primary-foreground`. Inaktivt: `text-muted-foreground hover:bg-muted/50`.
- Klikk på inaktivt segment → kaller `setLanguage(target)`. Klikk på aktivt segment → ingen-op.
- Hele kontrollen deaktiveres mens et språkbytte pågår (lokal `isSwitching`-state) for å hindre dobbeltklikk-race.
- Mobil-variant beholder kompakt høyde (`h-7`), desktop-variant `h-8`. Bruker eksisterende `Button` + Tailwind-tokens — ingen ny komponent.
- Fjerner `displayLang`-variabelen og `Globe`-importen blir kun beholdt hvis fortsatt brukt.

### 2. `src/components/Header.tsx` — toast-bekreftelse

I `toggleLanguage` (omdøpt til `handleLanguageChange(target)`):
- Etter `await setLanguage(target)`: `toast.success(t('header.languageChanged.' + target))`.
- Hvis `setLanguage` returnerer at DB-skriving feilet (se punkt 3): `toast.warning(t('header.languageNotPersisted'))` i tillegg.
- Hvis selve `changeLanguage` kaster: `toast.error(t('header.languageChangeFailed'))`.

### 3. `src/lib/i18nHelpers.ts` — eksponer persisterings-status

Endre `setLanguage` til å returnere `{ t: TFunction; persisted: boolean }`:

```ts
export async function setLanguage(lang: AppLanguage): Promise<{ t: TFunction; persisted: boolean }>
```

- `persisted = true` kun hvis bruker er innlogget og `update`-kallet ikke ga feil.
- Eksisterende kallere som ignorerer retur-verdien påvirkes ikke (TypeScript-signaturen smalner, men ingen kode i prosjektet bruker `t`-feltet i dag).

### 4. Oversettelser

Legg til i `src/i18n/locales/no.json` og `en.json`:

```jsonc
"header": {
  "languageChanged": {
    "no": "Språk endret til Norsk",   // EN: "Language set to Norwegian"
    "en": "Språk endret til Engelsk"  // EN: "Language set to English"
  },
  "languageNotPersisted": "Språket ble byttet, men ikke lagret på profilen.",
  "languageChangeFailed": "Kunne ikke bytte språk."
}
```

## Verifisering

1. Last inn appen — segmentet skal vise korrekt aktivt språk basert på DB-hydrert tilstand.
2. Klikk det inaktive segmentet → toast bekrefter; konsoll: `[i18n] Persisted preferred_language= en`; nytt DB-rad-update synlig.
3. Kjør risikovurdering → svar på valgt språk. Edge-logg viser `[ai-risk-assessment] Received language from client: "en"`.
4. Logg ut og inn → segmentet beholder valgt språk (hydrert fra DB).

## Hva planen IKKE rører

- Ingen DB-migrasjon, ingen RLS, ingen edge-function-endring.
- AuthContext-hydrering og `i18nHydratedRef`-logikken er allerede korrekt og endres ikke.
- `setLanguage`-DB-skrivingen er allerede `await`-et; ingen endring i selve persisterings-flyten utover å rapportere resultatet tilbake.
