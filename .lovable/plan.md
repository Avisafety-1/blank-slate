
## Utvidet filtrering og sortering på /dokumenter

### Hva finnes i dag
- Kategoribadger for å filtrere på type
- Én sortering: klikk på "Utløpsdato"-kolonnen for å sortere etter utløpsdato (nærmest først)
- Fritekst­søk

### Hva som mangler
Ingen filtrering på utløpsstatus (utgått, utgår snart, aktive), og ingen valg mellom flere sorteringsrekkefølger. All logikk er fordelt mellom `Documents.tsx` (filter/sort-logikk) og `DocumentsFilterBar.tsx` (UI).

---

### Nye statusfiltre

Tre smarte statusgrupper legges til som klikkbare badges øverst i filterlinjen:

| Filter | Logikk |
|---|---|
| **Utgått** | `gyldig_til < i dag` |
| **Utgår snart** | `gyldig_til` innen `varsel_dager_for_utløp` dager (standard 30 dager) |
| **Gyldig** | `gyldig_til` satt og lenger enn varsel-vinduet i fremtiden |
| **Uten utløp** | `gyldig_til` er null |

---

### Nye sorteringsvalg

En liten sorteringsvelger (dropdown eller knapper) erstatter/supplerer den nåværende klikkbare kolonnen:

| Sortering | Beskrivelse |
|---|---|
| **Nyeste først** (standard) | Etter `opprettet_dato` DESC |
| **Eldste først** | Etter `opprettet_dato` ASC |
| **Utgår snart** | `gyldig_til` ASC, null sist |
| **Alfabetisk A–Å** | Etter `tittel` ASC |
| **Alfabetisk Å–A** | Etter `tittel` DESC |

---

### Teknisk løsning

#### Ny type for sortering i `Documents.tsx`
```typescript
export type DocumentSortOption =
  | "newest"
  | "oldest"
  | "expiry"
  | "alpha_asc"
  | "alpha_desc";
```

#### Ny type for statusfilter i `Documents.tsx`
```typescript
export type DocumentStatusFilter = "expired" | "expiring_soon" | "valid" | "no_expiry";
```

#### Endringer i `Documents.tsx`
- Erstatt `sortByExpiry: boolean` med `sortOption: DocumentSortOption` (defaulter til `"newest"`)
- Legg til `selectedStatuses: DocumentStatusFilter[]` state
- Oppdater `filteredDocuments`-logikken til å filtrere på statusgruppe i tillegg til kategori og søk
- Oppdater sorteringslogikken til å bruke `sortOption`
- Send ny props til `DocumentsFilterBar` og `DocumentsList`

#### Endringer i `DocumentsFilterBar.tsx`
- Legg til en ny rad med statusfilter-badges (Utgått 🔴, Utgår snart 🟡, Gyldig 🟢, Uten utløp ⚪)
- Legg til sorteringsvelger — en `Select`-komponent med de fem alternativene

#### Endringer i `DocumentsList.tsx`
- Fjern `sortByExpiry`/`onToggleSortByExpiry` props (sortering håndteres nå i `Documents.tsx`)
- Fjern klikkbar `ArrowUpDown`-header på utløpsdato-kolonnen
- Legg til farget statusindikator i utløpsdato-cellen (rød = utgått, gul = utgår snart)

---

### Statusindikator i tabellen
Utløpsdato-cellen vises med farge-koding:
- Rød tekst + ikon → utgått
- Gul/oransje tekst + ikon → utgår snart
- Normal tekst → gyldig
- Grå kursiv → ingen utløpsdato

---

### Berørte filer
1. `src/pages/Documents.tsx` — ny sort/filter-state og logikk
2. `src/components/documents/DocumentsFilterBar.tsx` — ny UI for statusfiltre + sorteringsvelger
3. `src/components/documents/DocumentsList.tsx` — fjern gammel sort-prop, legg til farget utløpsstatus

Ingen database­endringer er nødvendig — all logikk er ren frontend-filtrering.
