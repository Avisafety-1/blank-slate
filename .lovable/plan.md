

## Vis hvem som lastet opp dokumentet i DocumentCardModal

### Problem
Når man klikker på et dokument fra /dokumenter vises ingen informasjon om hvem som lastet det opp, selv om `opprettet_av` (e-post) allerede lagres i databasen.

### Løsning
Legg til en info-seksjon i `DocumentCardModal.tsx` som viser:
- **Opprettet av**: hentes fra `opprettet_av`-feltet (e-post) på dokumentet
- **Opprettet dato**: fra `opprettet_dato`

### Endring

**`src/components/documents/DocumentCardModal.tsx`**
- Etter DialogTitle (linje ~343), legg til en liten metadata-seksjon som viser `document.opprettet_av` og formatert `document.opprettet_dato`
- Kun vist når man ser et eksisterende dokument (ikke ved opprettelse)
- `opprettet_av` er allerede tilgjengelig på `Document`-typen fra `Documents.tsx` (den hentes i queryen)

Eksempel plassering -- rett under `<DialogTitle>`:
```tsx
{document && !isCreating && (
  <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4">
    {document.opprettet_av && <span>Opprettet av: {document.opprettet_av}</span>}
    <span>Opprettet: {format(new Date(document.opprettet_dato), "dd.MM.yyyy", { locale: nb })}</span>
  </div>
)}
```

En fil endres, 5 linjer kode.

