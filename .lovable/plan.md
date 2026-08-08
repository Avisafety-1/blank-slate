# Fikse tom dokumentliste

## Hva som er galt

Dokumentlisten er tom for alle brukere fordi de nye reglene for dokumentdeling peker på hverandre i en sirkel:

- Regelen på `documents` sjekker delingstabellen `document_department_visibility`.
- Regelen på `document_department_visibility` sjekker tilbake i `documents`.

Postgres oppdager denne sirkelen og avviser hele spørringen ("infinite recursion detected in policy"), så frontend får en feil i stedet for dokumenter — listen blir tom. Dette treffer alle selskaper, som stemmer med at både Avisafe og Norconsult er tomme (databasen har 135 dokumenter på Avisafe og 23 på Norconsult).

## Løsning

Bryt sirkelen med to `SECURITY DEFINER`-funksjoner som gjør oppslagene uten å utløse tilgangsreglene på nytt.

### Databasemigrasjon

1. Ny funksjon `public.document_is_shared_with_user(_document_id uuid, _user uuid)` — returnerer true hvis det finnes en delingsrad for et selskap brukeren har tilgang til. `SECURITY DEFINER`, `STABLE`, `search_path = public`, kun `EXECUTE` til `authenticated`.
2. Ny funksjon `public.document_owner_company(_document_id uuid)` — returnerer eierselskapet til dokumentet. Samme sikkerhetsoppsett.
3. Erstatt SELECT-regelen "Users can view documents shared with their department" på `documents` slik at den bruker funksjon 1 i stedet for et direkte oppslag i delingstabellen.
4. Erstatt SELECT- og DELETE-reglene på `document_department_visibility` slik at de bruker funksjon 2 i stedet for et direkte oppslag i `documents`. INSERT-regelen kontrolleres og legges om på samme måte hvis den også slår opp i `documents`.

Ingen endring i hvem som faktisk får se hva — bare i hvordan oppslaget gjøres.

## Verifisering

- Kjør en test som simulerer en innlogget bruker og bekreft at `documents` returnerer rader uten rekursjonsfeil.
- Åpne /dokumenter i forhåndsvisningen og bekreft at listen fylles, at "Avisafe"-badge vises på globalt delte dokumenter, og at ingen feil dukker opp i konsollen.
