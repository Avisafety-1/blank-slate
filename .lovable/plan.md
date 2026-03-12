

# Facebook-publisering via Graph API

## Oversikt
Bygge en "Publiser til Facebook"-funksjon direkte i marketing-modulen. Når et utkast er ferdig, kan superadmin klikke en publiser-knapp som sender tekst + bilde til en Facebook Page via Meta Graph API.

## Forutsetninger
- En **Facebook Page** (ikke personlig profil)
- En **Page Access Token** med `pages_manage_posts` og `pages_read_engagement` tillatelser
- Token og Page ID lagres som Supabase secrets

## Arkitektur

```text
DraftEditorDialog
  └─ "Publiser til Facebook" knapp
       └─ supabase.functions.invoke("publish-facebook")
            └─ Edge Function
                 └─ POST graph.facebook.com/{page-id}/photos (eller /feed)
                      ├─ message = composedText
                      └─ url = image file_url (hvis bilde finnes)
```

## Implementasjonsplan

### 1. Legg til secrets
- `FACEBOOK_PAGE_ACCESS_TOKEN` — langvarig Page Access Token
- `FACEBOOK_PAGE_ID` — ID-en til Facebook-siden

### 2. Ny edge function: `publish-facebook`
- Mottar `{ text, imageUrl?, draftId }` i body
- Hvis bilde: POST til `https://graph.facebook.com/v22.0/{PAGE_ID}/photos` med `message` + `url`
- Hvis bare tekst: POST til `https://graph.facebook.com/v22.0/{PAGE_ID}/feed` med `message`
- Ved suksess: oppdater `marketing_drafts` med `status = 'published'` og `published_at = now()`
- Returner Facebook post-ID

### 3. UI-endringer i `DraftEditorDialog.tsx`
- Legg til en «Publiser til Facebook»-knapp (med Facebook-ikon) i footer-området
- Vis bekreftelsesdialog før publisering
- Vis laste-indikator under publisering
- Ved suksess: oppdater utkast-status og vis toast med lenke til posten

### 4. MarketingSettings — Facebook-konfigurasjon
- Legg til en seksjon i innstillinger der superadmin kan lime inn Page Access Token og Page ID
- Lagres som Supabase secrets via edge function (ikke localStorage)

## Oppsett for brukeren
1. Gå til [Facebook Developer Portal](https://developers.facebook.com)
2. Opprett en app → legg til «Pages API»-produktet
3. Generer en langvarig Page Access Token med `pages_manage_posts`-tillatelse
4. Lim inn token og Page ID i AviSafe-innstillingene

## Sikkerhet
- Token lagres kun som Supabase secret, aldri eksponert til frontend
- Edge function validerer autentisering via JWT
- Kun superadmin har tilgang til marketing-modulen

