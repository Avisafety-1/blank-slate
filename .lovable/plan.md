

## Problem

E-postmaler i systemet håndterer logoen inkonsekvent:

1. **Hardkodet HTML** (f.eks. `generateIncidentNotificationHTML` i `notifications.ts`, `resend-confirmation-email`) har **ingen logo**
2. **Standard-maler** i `template-utils.ts` (password_reset, admin_new_user, incident_notification osv.) har **ingen logo**
3. Kun egendefinerte maler redigert i editoren kan inneholde logo — men bare hvis admin har lagt den inn manuelt

## Løsning

Legge til AviSafe-logoen som standard i alle e-postmaler ved å:

### 1. Legg til en logo-header-snippet i `template-utils.ts`

Opprett en `getEmailLogoHeader()` funksjon som returnerer en standard header med AviSafe-logoen (fra den offentlige URL-en `https://avisafev2.lovable.app/avisafe-logo-text.png`). Denne brukes som fallback når selskapet ikke har en egen logo.

```text
┌──────────────────────────────────┐
│  [AviSafe Logo]                  │  ← Ny standard logo-header
│  ────────────────────────────     │
│  Eksisterende e-postinnhold      │
│                                  │
└──────────────────────────────────┘
```

### 2. Oppdater alle standard-maler

Legg til logo-bildet i `.header`-delen av alle defaultTemplates i `template-utils.ts` (password_reset, admin_new_user, incident_notification, mission_notification, document_expiry, user_welcome, followup_assigned).

### 3. Oppdater hardkodet HTML

- `src/lib/notifications.ts` → `generateIncidentNotificationHTML` — legg til logo
- `supabase/functions/resend-confirmation-email/index.ts` — legg til logo

### 4. Legg til `fixEmailImages` i e-poster som mangler det

Sjekk at alle edge functions som sender e-post kjører HTML-innholdet gjennom `fixEmailImages` for konsistent bildehåndtering.

### Teknisk detalj

Logo-URL bruker den publiserte appen (`https://avisafev2.lovable.app/avisafe-logo-text.png`) som er en stabil, offentlig URL. Bildet styres med `width="180"` og `style="display:block"` for e-postklient-kompatibilitet.

