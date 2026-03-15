

# Problem: Passkey RP ID mismatch

## Årsak

WebAuthn-passkeys er bundet til en spesifikk **RP ID** (Relying Party ID). I din edge-funksjon brukes `avisafe.no` som RP ID for alle `*.avisafe.no`-domener. Dette er teknisk korrekt — det lar passkeys fungere på tvers av subdomener (`app.avisafe.no` og `login.avisafe.no`).

**Men:** Hvis du registrerte passkeyen via den publiserte Lovable-URLen (`avisafev2.lovable.app`), ble passkeyen lagret med RP ID `avisafev2.lovable.app`. Når du deretter prøver å logge inn på `login.avisafe.no`, søker nettleseren etter passkeys med RP ID `avisafe.no` — og finner ingen match.

## Løsning

To ting må fikses:

### 1. Edge Function — Bruk `app.avisafe.no` som RP ID i stedet for `avisafe.no`

WebAuthn-spesifikasjonen krever at RP ID er et "registrable domain suffix" av det nåværende domenet. `avisafe.no` *bør* fungere for `app.avisafe.no`, men noen nettlesere (spesielt iOS Safari) kan være restriktive. Sikrere er å bruke `app.avisafe.no` og begrense passkey-innlogging til det domenet.

**Men** — da vil passkeys ikke fungere på `login.avisafe.no`. Innlogging med passkey bør derfor skje fra `app.avisafe.no`.

**Anbefalt tilnærming:** Behold `avisafe.no` som RP ID (dette er korrekt), men sørg for at passkeys alltid registreres og brukes fra produksjonsdomener, ikke fra Lovable-preview.

### 2. Frontend — Legg til advarsel ved feil domene

I `PasskeySetup.tsx`: Vis en melding hvis bruker er på `lovable.app`-domene om at passkeys må registreres via `app.avisafe.no`.

I `Auth.tsx`: Vis passkey-innlogging bare på produksjonsdomener, eller vis en melding om å gå til `login.avisafe.no`.

### 3. Slett gammel passkey

Passkeyen som ble registrert på `avisafev2.lovable.app` må slettes fra profilen, og en ny passkey må registreres mens du er innlogget via `app.avisafe.no`.

## Endringer

**`src/components/PasskeySetup.tsx`** — Legg til advarsel hvis bruker er på feil domene:
- Importer `isDevelopment` fra `config/domains`
- Vis en info-boks som forklarer at passkeys må settes opp via `app.avisafe.no`
- Deaktiver "Legg til passkey"-knappen på dev/preview-domener

**`src/pages/Auth.tsx`** — Vis passkey-login kun på riktige domener:
- Skjul passkey-knappen på Lovable-preview (den vil uansett ikke fungere pga. RP ID mismatch)

