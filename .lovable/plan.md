
## Legg til bildeopplasting i tilbakemelding

### Endringer

**1. Opprett storage-bucket `feedback-attachments`** (migrasjon)
- Offentlig bucket for enkel tilgang i e-post
- RLS: Kun autentiserte brukere kan laste opp

**2. `src/components/ProfileDialog.tsx`**
- Legg til state for valgt bilde (`feedbackImage: File | null`) og forhåndsvisning
- Legg til filinput med bildevelger (accept="image/*")
- Ved sending: last opp bildet til `feedback-attachments/{userId}-{timestamp}.ext`, hent public URL
- Send `imageUrl` med i body til edge function

**3. `supabase/functions/send-feedback/index.ts`**
- Motta valgfri `imageUrl` fra body
- Inkluder bildet i HTML-e-posten som `<img>`-tag

### Resultat
Brukere kan legge ved et skjermbilde eller bilde når de sender tilbakemelding. Bildet vises direkte i e-posten som mottas.
