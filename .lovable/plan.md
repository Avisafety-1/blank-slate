

## Risikovurdering av den planlagte auth-refaktoreringen

### Er endringen trygg? Ja — med noen forbehold.

Planen berører **kun klientsiden** (React/TypeScript). Ingen database-migrasjoner, ingen RLS-endringer, ingen endringer i Edge Functions. Avdelingsstrukturen, `get_user_visible_company_ids()`, og alle RLS-policyer forblir urørt.

### Hva endres og risiko per punkt

| Endring | Risiko | Begrunnelse |
|---|---|---|
| **Bytte pseudo-refs til `useRef`** i AuthContext (linje 122-124) | Svært lav | Ren bugfix — dagens kode lager nye objekter per render, noe som bryter deduplisering/cache. `useRef` er standard React-pattern. |
| **Ikke overskrive admin-state ved delvis feil** | Lav | Dagens kode setter `isAdmin=false` hvis rollequery feiler mens profilquery lykkes. Fiksens logikk: behold forrige gyldige verdi ved feil. Verre case: admin-status "henger" litt lenger — men det er bedre enn at den forsvinner. |
| **Erstatte `useAdminCheck()` med `useAuth().isAdmin`** | Lav | `useAdminCheck` gjør en separat `has_role` RPC som allerede gjøres i AuthContext. Fem filer bruker den (Documents, DroneDetailDialog, EquipmentDetailDialog, NewsDetailDialog + hooken selv). Endringen fjerner bare et duplikat-kall — ingen ny logikk. |
| **Lazy-loading i ProfileDialog** | Lav | Flytte queries fra mount til dialog-open. Ingen funksjonell endring, bare timing. |
| **Innføre "profileLoaded"-flagg** | Lav-Middels | Nytt state-felt i AuthContext som skiller "ikke lastet enda" fra "ikke godkjent". Krever at alle steder som bruker `isApproved` håndterer den nye mellomtilstanden korrekt. |

### Påvirkning på eksisterende brukere

- **Vanlige brukere**: Ingen merkbar endring. Innlogging blir raskere, færre API-kall.
- **Administratorer**: Admin-ikonet vil ikke lenger forsvinne ved treg/feilende nettverksrespons.
- **Superadminer**: Ingen endring — superadmin-sjekken er allerede i AuthContext.
- **Avdelingsstruktur**: Helt uberørt. Alle avdelingsfunksjoner (company switcher, `get_user_visible_company_ids`, godkjenningsflyt, hierarkisk RLS) ligger i databasen og andre komponenter som ikke endres.
- **Subscription/billing**: Uberørt.

### Det eneste risikopunktet

Innføring av `profileLoaded`-flagget krever at vi verifiserer **alle** steder som sjekker `isApproved` eller `loading` for å vise/skjule innhold. Hvis ett sted glemmes, kan en bruker se en "venter på godkjenning"-melding i et glimt. Dette er enkelt å teste og reversere.

### Anbefaling

Endringen er trygg å gjennomføre. Den er rent klient-side, fjerner kjente bugs (pseudo-refs, duplikate kall, falske negative admin-verdier), og berører ikke avdelingsarkitekturen. Hovedrisikoen (profileLoaded-flagget) kan testes ved å logge inn som admin, vente, og refreshe — nøyaktig det scenarioet som feiler i dag.

Skal jeg implementere?

