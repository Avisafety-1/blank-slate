Plan:

1. Beholde avsenderadresse uendret
   - `noreply@avisafe.no` beholdes som standard/fallback.
   - Ingen endringer i `email_settings`, `email-config.ts` eller migrasjoner for avsender nå.

2. Endre alle e-postlogo-URLer bort fra Lovable
   - Erstatte alle synlige e-postbilder som peker til:

```text
https://avisafev2.lovable.app/avisafe-logo-text.png
```

   med:

```text
https://app.avisafe.no/avisafe-logo-text.png
```

   Dette fjerner `lovable.app` fra HTML-kilden i e-postene og bør løse Resend-varselet om at bilder hostes på et annet/ikke-brandet domene.

3. Oppdatere relevante filer
   Jeg fant disse stedene som skal oppdateres:

```text
src/lib/notifications.ts
supabase/functions/resend-confirmation-email/index.ts
supabase/functions/check-long-flights/index.ts
supabase/functions/send-notification-email/index.ts
supabase/functions/_shared/template-utils.ts
src/components/UploadDroneLogDialog.tsx
supabase/functions/marketing-visual/index.ts
```

   `marketing-visual` bruker logoen som input til AI/markedsføringsvisuals, men jeg oppdaterer den også for konsistens.

4. Oppdatere offentlige metadata som peker til lovable.dev
   I tillegg fjerne `lovable.dev` fra `index.html` metadata:

```text
https://lovable.dev/opengraph-image-...
```

   og erstatte med en AviSafe/public URL, for eksempel:

```text
https://app.avisafe.no/avisafe-logo-text.png
```

   Eventuelt et bedre OG-bilde hvis det allerede finnes i `public/`.

5. La interne Lovable-infrastrukturkall være urørt
   Følgende skal ikke endres nå, fordi de er interne/tekniske og ikke vises i e-postene:

```text
https://ai.gateway.lovable.dev/...
```

   WebAuthn/fallback-referanser til preview/Lovable vurderes separat, siden de kan påvirke innlogging i preview/dev.

Resultat: E-postene vil fortsatt sendes fra `noreply@avisafe.no`, men bilde-URLene og synlig metadata vil ikke lenger eksponere `lovable.app`/`lovable.dev`.