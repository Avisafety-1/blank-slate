
## Plan: Forenkle e-postinnstillinger-dialogen for Resend

### Problem
EmailSettingsDialog viser fortsatt SMTP-konfigurasjon (host, port, passord, TLS) og en "Bruk AviSafe mailserver"-toggle, men backend bruker utelukkende Resend API. SMTP-feltene har ingen funksjon og er misvisende for selskapsadministratorer.

### Løsning
Forenkle dialogen til kun å vise det som faktisk har effekt:

1. **Fjern** all SMTP-relatert UI:
   - "Bruk AviSafe mailserver"-toggle og `AVISAFE_SMTP`-konstanten
   - SMTP Host, Port, TLS, Brukernavn, Passord-felt
   - `useAviSafe`-state og `handleUseAviSafeToggle`

2. **Behold**:
   - Avsendernavn-felt (`from_name`)
   - Aktiver/deaktiver e-postsending-toggle (`enabled`)
   - Test e-post-seksjon
   - Lagre-knapp

3. **Oppdater**:
   - Dialog-beskrivelse: fra "Konfigurer SMTP-innstillinger" til "Konfigurer avsender for e-post fra systemet"
   - Info-alert: "E-post sendes via AviSafe (Resend). Du kan tilpasse avsendernavn nedenfor."
   - `handleSave`: send kun `from_name`, `from_email` og `enabled` til RPC — sett SMTP-felt til standardverdier

4. **Vurder** å fjerne `from_email`-feltet fra UI eller gjøre det read-only med info om at domenet må verifiseres i Resend. For nå: vis det som read-only med verdien `noreply@avisafe.no`.

### Filer
- `src/components/admin/EmailSettingsDialog.tsx` — forenkle UI, fjern SMTP-felt
