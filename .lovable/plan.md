# Runde 2 — Storage bucket listing-fiks (5 lints)

## Mål
Fjerne 5 `public_bucket_allows_listing`-advarsler uten å påvirke noen brukerfunksjon.

## Bakgrunn — viktig nyanse

Linteren flagger at storage-buckets med en bred `SELECT`-policy på `storage.objects` lar klienter **liste alle filer** (kalle `storage.from('X').list()`). Dette er **separat** fra om public URL-er fungerer:

- **`getPublicUrl()`** på en public bucket går mot CDN-en og **bruker ikke RLS**. Fungerer uansett policy.
- **`.list()`** og **`.download()`** via API-en bruker derimot RLS på `storage.objects`.

**Verifisert i koden:** `rg "storage.from(...).list"` og `.download` på disse 5 bucketene gir **null treff**. Ingen kode lister filer i `avatars`, `email-images`, `signatures`, `marketing-media`, eller `feedback-attachments`. All bruk er via `getPublicUrl()` eller `.upload()`.

**Konsekvens:** Vi kan trygt droppe de brede SELECT-policiene. Public URL-er fortsetter å fungere identisk (de går via CDN), og ingen kodebane lister filer.

## Eksisterende policies som flagges

| Bucket | Bred SELECT-policy som droppes |
|---|---|
| `avatars` | `Users can view all avatars` (`bucket_id = 'avatars'`) |
| `email-images` | `Email images are publicly accessible` (`bucket_id = 'email-images'`) |
| `signatures` | `Signatures are publicly readable` (`bucket_id = 'signatures'`) |
| `marketing-media` | `marketing_media_read` (`bucket_id = 'marketing-media'`) |
| `feedback-attachments` | `Anyone can view feedback attachments` (`bucket_id = 'feedback-attachments'`) |

Alle øvrige policies (INSERT/UPDATE/DELETE per eier eller per company-folder) **beholdes urørt**.

## Migrasjon

```sql
-- Behold buckets som public (CDN-tilgang via getPublicUrl fortsetter å fungere)
-- Drop kun de brede SELECT-policiene som tillater listing via API

DROP POLICY IF EXISTS "Users can view all avatars"           ON storage.objects;
DROP POLICY IF EXISTS "Email images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Signatures are publicly readable"     ON storage.objects;
DROP POLICY IF EXISTS "marketing_media_read"                 ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view feedback attachments" ON storage.objects;
```

Ingen kodeendringer nødvendig.

## Risikomatrise

| Endring | Sannsynlighet for problem | Konsekvens hvis problem | Mitigering |
|---|---|---|---|
| Drop SELECT på `avatars` | **Lav** — bruker `getPublicUrl()` overalt | Avatarer vises ikke | Rollback (se under) |
| Drop SELECT på `email-images` | **Lav** — kun `getPublicUrl()` i `EmailTemplateEditor`, `BulkEmailSender` | Bilder i e-post-mal-editor vises ikke | Rollback |
| Drop SELECT på `signatures` | **Lav** — `SignatureDrawerDialog` bruker `getPublicUrl()` | Signaturer vises ikke i PDF/UI | Rollback |
| Drop SELECT på `marketing-media` | **Lav** — 4 filer bruker `getPublicUrl()` | Marketing-bilder vises ikke | Rollback |
| Drop SELECT på `feedback-attachments` | **Lav** — `ProfileDialog` bruker `getPublicUrl()` | Bilder i feedback-e-post vises ikke | Rollback |

**Hovedrisiko:** Hvis Supabase-CDN-en faktisk respekterer `storage.objects`-RLS for public buckets (mot dokumentasjonen), vil offentlig tilgang til filer brytes. Jeg vurderer dette som **svært usannsynlig**, men derfor planen under.

## Test-plan (etter migrasjon)

Sjekk hver av disse i preview rett etter migrasjonen:

1. **Avatars:** Åpne en bruker-profil — vises avatar?
2. **E-post-bilder:** Åpne `Admin → E-post-mal-editor`, last opp et bilde — vises preview?
3. **Signaturer:** Åpne en flight log med signatur — vises signaturen?
4. **Marketing:** Åpne `Marketing → Visuals` — vises mediagalleri?
5. **Feedback:** Send en feedback med bildevedlegg fra ProfileDialog — kommer bildet med i e-posten?

Hvis ALT virker → ferdig. Hvis NOE feiler → kjør rollback umiddelbart.

## Rollback-plan

Én enkelt migrasjon gjenoppretter alle policies eksakt slik de var:

```sql
CREATE POLICY "Users can view all avatars" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'avatars');

CREATE POLICY "Email images are publicly accessible" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'email-images');

CREATE POLICY "Signatures are publicly readable" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'signatures');

CREATE POLICY "marketing_media_read" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'marketing-media');

CREATE POLICY "Anyone can view feedback attachments" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'feedback-attachments');
```

(Lagres som backup før vi ruller ut hovedmigrasjonen, slik at rollback er ett klikk unna.)

Alternativt: Bruk Lovable-historikk og rull tilbake til før migrasjonen.

## Hva som **IKKE** er med

- **Privatisering av buckets** (gjøre dem ikke-public + signed URLs): Ble vurdert i opprinnelig plan, men krever omfattende kodeendringer i 8+ filer og endrer fundamentalt hvordan e-poster (som inkluderer bilde-URL-er) fungerer. Dette utsettes til en fremtidig runde med mer testing.
- `feedback-attachments` privatisering: Fordi e-post sendt til support må vise bildet uten innlogging — krever signed URL med lang varighet. Egen runde.
- `signatures` privatisering: PDF-eksport for inspeksjoner inkluderer signatur som offentlig URL. Krever signed URL-arkitektur. Egen runde.

## Forventet resultat
- 5 lints fjernet.
- Null endring i hva brukere ser eller kan gjøre (verifisert via test-planen).
- Filer kan ikke lenger listes via API uten innlogging — men ingen kodebane gjør dette.

## Anbefaling

Dette er en lavrisiko-endring forutsatt at test-planen kjøres rett etter migrasjonen. Hvis du ønsker enda mer forsiktighet kan vi droppe én policy om gangen (5 separate migrasjoner) og teste mellom hver — si fra hvis du foretrekker den fremgangsmåten.
