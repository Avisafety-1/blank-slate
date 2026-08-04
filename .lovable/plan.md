# Riktig avsendernavn på e-post fra meldingstråder

## Hva som skjedde

E-postvarselet fra gruppechatten ble sendt med avsendernavnet «Norconsult» fordi `send-message` henter avsenderoppsettet fra **trådens** selskap, ikke fra den som faktisk skriver meldingen:

```
const companyId = parent?.company_id ?? sender.company_id;
const emailCfg = await getEmailConfig(companyId);
```

Trådens `company_id` peker på Norconsult Norge AS, og det selskapet er det eneste i basen (sammen med Drone Nord) som har satt et eget `from_name` i `email_settings` — «Norconsult». Alle andre selskaper står med «AviSafe», derfor har dette ikke blitt synlig før. E-postadressen `noreply@avisafe.no` er lik for alle og var derfor riktig.

## Foreslått løsning

Meldinger mellom personer på tvers av selskaper skal aldri se ut som de kommer fra et annet selskaps merkevare. For interne meldinger bruker vi et nøytralt, personlig avsendernavn:

- Avsendernavn settes til «`<Avsenders navn>` via AviSafe» (faller tilbake til «AviSafe» hvis navn mangler), fra `noreply@avisafe.no`.
- `Reply-To` settes til avsenderens e-postadresse, slik at et vanlig svar går til rett person.
- Selskapets `email_settings.from_name` brukes fortsatt som i dag for alle andre e-poster (varsler, invitasjoner osv.) — kun meldingstjenesten endres.

## Teknisk

- Fil: `supabase/functions/send-message/index.ts`
- Erstatt `getEmailConfig(parent?.company_id ?? sender.company_id)` med et fast avsenderoppsett bygget av `formatSenderAddress(\`${sender.full_name} via AviSafe\`, "noreply@avisafe.no")`.
- Send med `replyTo: sender.email` i `sendEmail`-kallet (støttes allerede i `_shared/resend-email.ts`).
- Ingen databaseendringer, ingen endring i UI.
