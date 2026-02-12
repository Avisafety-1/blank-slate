
# Endre mottakeradresse for tilbakemeldingsskjemaet

## Endring

En enkel endring i edge-funksjonen `supabase/functions/send-feedback/index.ts`:

Endre mottakeradressen fra `kontakt@avisafe.no` til `feedback@avisafe.no`.

## Tekniske detaljer

**Fil:** `supabase/functions/send-feedback/index.ts`

Linje som endres:
- **Fra:** `to: 'kontakt@avisafe.no'`
- **Til:** `to: 'feedback@avisafe.no'`

Ingen andre endringer er nødvendige. Frontend-koden i `ProfileDialog.tsx` kaller allerede `send-feedback`-funksjonen korrekt.
