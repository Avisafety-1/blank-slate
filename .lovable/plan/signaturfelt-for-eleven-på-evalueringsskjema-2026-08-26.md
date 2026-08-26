# Signaturfelt for eleven på evalueringsskjema

Eleven skal kunne signere evalueringen med finger/penn etter at instruktøren har fullført skjemaet. Meldingen eleven får i innboksen oppdateres til å si at skjemaet krever signatur.

## Slik fungerer det

**For instruktøren**
- Nederst i skjemaet vises en signaturseksjon: "Elevens signatur — venter på signatur fra <elev>".
- Instruktøren kan ikke signere på vegne av eleven.

**For eleven**
- Når skjemaet er fullført (lagret) og eleven åpner det fra innboksen eller loggboken, vises en knapp "Signer skjemaet".
- Knappen åpner den eksisterende fullskjerms tegneflaten (touch/mus, roteres på mobil) med Tøm / Angre / Lagre.
- Etter lagring vises signaturbildet, elevens navn og tidspunkt for signering i skjemaet, og knappen forsvinner.
- Signaturen kan ikke endres etterpå (kun admin/instruktør kan eventuelt nullstille — ikke del av denne fasen).
- Signaturen som tegnes her lagres kun på evalueringen; den overskriver ikke elevens profilsignatur.

**Melding til eleven**
- Teksten endres til å be om signatur, f.eks.: "Du har fått en ny evaluering på oppdrag «xxx». Skjemaet krever din signatur. Åpne skjemaet for å signere. Det finnes også i din loggbok."
- Emne og deeplink som i dag.

## Data

Migrasjon på `evaluation_responses`:
- `student_signature_url` (tekst) — lenke til signaturbildet
- `student_signed_at` (tidspunkt)
- `student_signature_name` (tekst) — navnet som ble signert med

Tilgangsregler: dagens oppdateringsregel gir kun oppretter/instruktør/admin lov til å endre raden, så eleven kan ikke signere i dag. Løses med en egen databasefunksjon `sign_evaluation_response(p_response_id, p_signature_url)` som:
- kun tillater at innlogget bruker er `student_id` på raden
- kun tillater signering når status er `completed`
- avviser hvis det allerede finnes en signatur
- setter kun signaturfeltene (ingen andre felter kan endres av eleven)

## Teknisk

- Migrasjon: tre nye kolonner + SECURITY DEFINER-funksjon med `search_path = public` og EXECUTE til `authenticated`.
- `src/components/SignatureDrawerDialog.tsx`: ny valgfri prop `persistToProfile` (default true) slik at evalueringssignering ikke skriver til `profiles.signature_url`. Filen lastes fortsatt opp til `signatures`-bucketen under `<user.id>/`.
- Ny `src/components/evaluation/EvaluationSignatureSection.tsx`: viser status (usignert / signert med bilde, navn og dato) og "Signer"-knapp når innlogget bruker er eleven og status er `completed`.
- `src/components/evaluation/EvaluationFormPreview.tsx`: ny `signatureSlot` rendret under totalvurderingen (samme mønster som `visibilitySlot`).
- `src/components/evaluation/EvaluationResponseDialog.tsx`: sender `signatureSlot`, oppdaterer lokal state etter signering og kaller `onSaved`. Seksjonen ligger utenfor `pointer-events-none`-wrapperen som brukes ved låst skjema, slik at eleven faktisk kan trykke.
- `src/lib/evaluationNotification.ts`: oppdatert meldingstekst (nye i18n-nøkler).
- Alle nye strenger via `t()` i både `no.json` og `en.json`; semantiske design tokens.
