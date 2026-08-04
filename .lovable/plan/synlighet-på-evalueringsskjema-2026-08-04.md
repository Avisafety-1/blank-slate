# Synlighet på evalueringsskjema

Legg til en tydelig, lysegul "Synlighet"-seksjon i det utfylte evalueringsskjemaet, som styrer hvem som får se den enkelte evalueringen. Regelen lagres på selve evalueringen og gjelder overalt hvor skjemaet senere åpnes (oppdrag, dokumenter, revisjon).

## Regler

- Før utfylling: malen er som i dag synlig for alle i selskapet (ingen endring).
- Utkast lagret: instruktør (og den som opprettet) ser evalueringen. Eleven ser den ikke ennå.
- Fullført/lagret: eleven får også innsyn.
- Ekstra mottakere: instruktøren kan velge enkeltpersoner i selskapet som skal se skjemaet, og/eller huke av "Alle administratorer".
- Admin og superadmin har alltid innsyn (revisjon/compliance).

## Grensesnitt

I `EvaluationResponseDialog`, rett under topp-feltene (instruktør/elev/oppdrag), legges en egen boks med lysegul bakgrunn og ramme (semantiske tokens, fungerer i mørk modus) med tittel "Synlighet" og et lite skjold-/øye-ikon:

- Kort forklarende tekst om standardreglene (utkast = instruktør, fullført = elev).
- Bryter: "Del med alle administratorer".
- Flervalg: "Andre personer med innsyn" – søkbar liste over personer i selskapet.
- Oppsummeringslinje: "Sees nå av: …" basert på gjeldende status.
- Boksen er låst (kun lesing) når evalueringen er fullført, på samme måte som resten av skjemaet.

Alle tekster legges inn som i18n-nøkler i både `no.json` og `en.json`.

## Teknisk

Database (`evaluation_responses`):
- Ny kolonne `share_with_admins boolean not null default true`.
- Ny kolonne `extra_viewer_ids uuid[] not null default '{}'`.

Ny SELECT-policy som erstatter dagens "alle i synlige selskaper kan se":
- selskapet må være i `get_user_visible_company_ids(auth.uid())`, OG
- brukeren er `created_by`, `instructor_id`, eller står i `extra_viewer_ids`, ELLER
- brukeren er `student_id` og `status = 'completed'`, ELLER
- brukeren har rollen `admin`/`superadmin` (alltid innsyn).

UPDATE/DELETE/INSERT-policyene beholdes som i dag (skriving fortsatt begrenset til oppretter/admin).

Frontend:
- `EvaluationResponseDialog.tsx`: ny visibility-state, henting av selskapets personer via `profiles`/`user_companies`, lagring av de to nye feltene i payload.
- `useMissionEvaluation.ts`: utvide `EvaluationResponseRow`-typen med de nye feltene.
- Ingen ekstra filtrering i lister er nødvendig – RLS gjør at skjulte evalueringer ikke returneres, så knapper/kort som viser eksisterende evaluering faller automatisk tilbake til "ikke utfylt" for brukere uten innsyn.
