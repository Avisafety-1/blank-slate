

# Passkey-prompt etter første innlogging

## Oversikt
Vis en dialog på dashboardet etter vellykket innlogging som spør brukeren om de vil aktivere biometrisk innlogging (passkey). Vises kun én gang, og kun hvis brukeren ikke allerede har en passkey.

## Implementering

### Ny komponent: `src/components/PasskeyPromptDialog.tsx`
- Dialog med forklaring: «Vil du aktivere biometrisk innlogging?»
- To knapper: «Ja, aktiver» og «Ikke nå»
- «Ja» starter `startRegistration` direkte (samme flyt som PasskeySetup)
- «Ikke nå» lukker dialogen og setter `localStorage.setItem("avisafe_passkey_prompt_dismissed", "1")`
- Vises kun når:
  1. `PublicKeyCredential` er støttet
  2. Ikke utviklingsmiljø
  3. `localStorage` har ikke `avisafe_passkey_prompt_dismissed` eller `avisafe_passkey_registered`
  4. Brukeren har ingen passkeys i DB (sjekk via `supabase.from("passkeys").select("id").limit(1)`)

### Endring: `src/pages/Index.tsx`
- Importer og render `<PasskeyPromptDialog />` i dashboardet
- Ingen props nødvendig — komponenten håndterer all logikk selv

### Flyt
1. Bruker logger inn med e-post/passord → lander på dashboard
2. `PasskeyPromptDialog` mount → sjekker betingelsene
3. Hvis alt passer: viser dialog
4. Bruker velger «Aktiver» → WebAuthn-registrering kjører → lukker dialog
5. Bruker velger «Ikke nå» → lukker dialog, vises aldri igjen

