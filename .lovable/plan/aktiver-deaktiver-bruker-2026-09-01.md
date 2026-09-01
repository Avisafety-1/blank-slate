# Aktiver / deaktiver bruker

Admin kan sette en bruker som deaktivert. Brukeren beholdes uendret i systemet (profil, loggbøker, historikk, oppdragskoblinger), men blokkeres fra å logge inn, og markeres med en «Deaktivert»-badge på personellkortet.

## Slik fungerer det for brukeren

- Admin/superadmin får en knapp «Deaktiver bruker» / «Aktiver bruker» på hver bruker i listen over godkjente brukere på admin-siden, med en bekreftelsesdialog.
- En deaktivert bruker som prøver å logge inn får beskjed om at kontoen er deaktivert og at de må kontakte administrator, og blir logget ut igjen umiddelbart.
- Aktive økter avsluttes ved deaktivering, slik at brukeren ikke blir stående innlogget.
- Personellkortet på /ressurser viser en grå «Deaktivert»-badge. Brukeren blir liggende i listen som før.
- Ingenting slettes, og ingen roller, oppdrag eller loggbokoppføringer endres. Reaktivering gjenoppretter tilgangen fullt ut.

## Database

Ny migrasjon på `profiles`:

- `is_active` (ja/nei, standard ja)
- `deactivated_at` (tidspunkt)
- `deactivated_by` (hvem som deaktiverte)

Tilgangsregler: eksisterende regler for `profiles` beholdes. Selve av-/påskrudden gjøres kun via en server-funksjon som verifiserer at den som ber om det er admin eller superadmin i samme selskapshierarki — vanlige brukere kan ikke endre feltet.

## Ingen tilbakevirkende kraft (garanti)

Endringen kan ikke deaktivere noen som er aktiv i dag:

- Kolonnen legges til som `is_active boolean NOT NULL DEFAULT true`, så alle eksisterende rader får verdien «aktiv» i samme operasjon. Migrasjonen inneholder ingen `UPDATE`, ingen `false`-verdier og ingen betinget logikk.
- Innloggingssperren ligger i Auth (`ban_duration`) og settes kun av edge-funksjonen når en admin trykker «Deaktiver» på én konkret bruker. Migrasjonen rører ikke `auth.users`, og det kjøres ingen bulk-ban eller bakgrunnsjobb.
- Ingen eksisterende økter avsluttes av utrullingen; `signOut` kalles bare for den ene brukeren som deaktiveres manuelt.
- Frontend-sjekkene bruker `is_active === false` (eksplisitt), ikke «falsy», så en manglende/ikke-lastet verdi aldri tolkes som deaktivert.
- Personellkortets badge vises kun ved `is_active === false`.
- Etter migrasjonen verifiseres det med en telling at antall rader med `is_active = false` er 0.


## Teknisk

**Ny edge function `admin-set-user-active`** (bygget over samme mønster som `admin-delete-user`):

- Autentiserer kaller via `auth.getUser(token)`, sjekker rolle i `user_roles` (admin/superadmin) og at målbrukeren tilhører et selskap kalleren har tilgang til (`get_user_visible_company_ids`).
- Blokkerer selv-deaktivering og deaktivering av superadmin med mindre kaller er superadmin.
- Bruker service-klient til:
  - `auth.admin.updateUserById(userId, { ban_duration: '876000h' })` ved deaktivering og `{ ban_duration: 'none' }` ved aktivering — dette er den faktiske innloggingssperren, håndhevet av Auth-serveren.
  - `auth.admin.signOut(userId)` for å avslutte aktive økter ved deaktivering.
  - Oppdaterer `profiles.is_active`, `deactivated_at`, `deactivated_by`.
- Returnerer feil med status og tekst; CORS på alle svar.

**Frontend:**

- `src/pages/Admin.tsx`: hent `is_active` i profil-spørringen, legg til knapp + `AlertDialog` per bruker i «Godkjente brukere»-listen, kall `supabase.functions.invoke('admin-set-user-active', { body: { user_id, active } })`, refresh listen, toast ved suksess/feil. Deaktiverte brukere vises med dempet stil og «Deaktivert»-badge også her.
- `src/pages/Auth.tsx`: utvid den eksisterende `approved`-sjekken (linje ~507 og Google-flyten ~232) til også å lese `is_active`; ved `false` vis melding og `signOut()`. Banningen i Auth-serveren stopper uansett innlogging, dette gir bare en forståelig feilmelding.
- `src/pages/Resources.tsx`: ta med `is_active` i personell-spørringen (fjerner ikke `approved`-filteret) og render en grå «Deaktivert»-badge på personellkortet.
- Alle nye strenger legges inn i `src/i18n/locales/no.json` og `en.json` og brukes via `t()`.

**Ikke endret:** abonnement/setetelling, roller, RLS på andre tabeller, sletting av bruker.
