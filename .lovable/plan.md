## Årsak (verifisert)

Svarfeltet vises kun når `replyRecipientIds` ikke er tom. Deltakerne bygges i `fetchParties()` (`useInboxMessages.ts`), som slår opp `profiles` direkte. RLS på `profiles` er:

`(company_id = ANY (get_user_visible_company_ids(auth.uid()))) OR (auth.uid() = id)`

Det betyr at profiler i andre selskaper **ikke** returneres. I tråder på tvers av selskaper (Avisafe ↔ Norconsult/Tensio) blir derfor:
- `recipients` tomt (rader filtreres bort i `byMessage` fordi `parties.get()` er `undefined`)
- `participants` tomt i `useMessageThread`

Resultat: i «Sendt» finnes ingen mottakere → `canReply = false` → ingen svarboks. I mottatte tråder finnes avsender-ID direkte, derfor vises boksen alltid der, men gruppetråder faller tilbake til «Reply goes to the sender» fordi de andre deltakerne mangler.

Meldingsradene selv er intakte (f.eks. «AviSafe - Norconsult» har 3 mottakere, «Gruppechat» 6–7).

## Løsning

1. **Ny SECURITY DEFINER-funksjon** `public.get_message_parties(_ids uuid[])` som returnerer `id, full_name, email, company_name` — men kun for brukere som deler minst én melding/tråd med kalleren (avsender eller mottaker i `internal_messages` / `internal_message_recipients`). Ingen generell profil-eksponering; GRANT EXECUTE kun til `authenticated`.
2. **`fetchParties()`** bytter fra direkte `profiles`-spørring til denne RPC-en (samme returtype, ingen endring i kallende kode).
3. **`InboxTab.tsx`**: sikre at svarfeltet også fungerer som fallback når deltakerlisten er tom, men brukeren er avsender og tråden har mottakere fra `internal_message_recipients`; og at teksten «Reply goes to all participants» vises når det faktisk er flere deltakere.

## Teknisk

- Migrasjon: kun ny funksjon (ingen tabell-endring, ingen RLS-endring på `profiles`).
- Filer: `src/components/profile/hooks/useInboxMessages.ts` (fetchParties), `src/components/profile/InboxTab.tsx` (fallback + tekst).
- Verifisering: kjør funksjonen for hauggard-kontoen mot «AviSafe - Norconsult»- og «Gruppechat»-trådene og bekreft at alle mottakere returneres, deretter sjekk at svarfeltet vises i både «Sendt» og «Mottatt».
