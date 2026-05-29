## Problem

I `src/components/admin/MissionTypesSection.tsx` (linje 60–71) lastes dokumentene som kan velges som standard-dokument for en oppdragstype slik:

```ts
supabase.from("documents")
  .select("id, tittel, kategori")
  .eq("company_id", source)
  .not("fil_url", "is", null)
  .order("tittel")
```

`.not("fil_url", "is", null)` filtrerer bort alle dokumenter som ikke har en opplastet fil — typisk **lenke-dokumenter** (`nettside_url`) som er fullt gyldige dokumenter i systemet. Derfor mangler de i picker-listen.

## Fiks

`src/components/admin/MissionTypesSection.tsx`:

1. Fjern `.not("fil_url", "is", null)`-filteret slik at både fil-baserte og lenke-baserte dokumenter vises.
2. Utvid `select` til også å hente `nettside_url` (og `fil_url`) så vi senere kan vise et lite ikon i listen som indikerer type (fil vs. lenke) — valgfritt, men nyttig for brukeren.
3. Behold sortering på `tittel` og `company_id`-scoping (eierskap).
4. Oppdater `DocOption`-typen tilsvarende.

Ingen DB- eller RLS-endringer nødvendig — dokumentene ligger allerede i `documents`-tabellen med korrekt company-scoping.

## Resultat

Alle dokumenter for selskapet (både fil- og lenke-dokumenter) dukker opp i dialogen «Tilknytt dokument til oppdragstype».