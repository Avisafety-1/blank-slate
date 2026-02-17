
## Problem: «Utført av» viser alltid innlogget bruker, ikke den som opprettet SORA-analysen

### Rot-årsak

I `src/components/dashboard/SoraAnalysisDialog.tsx` linje 489–491 er «Utført av»-feltet hardkodet til å alltid vise den innloggede brukerens e-post:

```tsx
<Label>Utført av</Label>
<Input value={user?.email || ""} disabled />
```

Dette er feil — feltet skal vise e-posten til den brukeren som opprinnelig opprettet analysen (`prepared_by` UUID i databasen), ikke den som for øyeblikket har dialogboksen åpen.

Databasen lagrer `prepared_by` korrekt som en UUID (bruker-ID), men visningen slår ikke opp denne UUIDen for å hente riktig e-post/navn.

### Bevis fra databasen

Databasespørringen bekrefter at `prepared_by` er korrekt lagret for alle rader:
- Norconsult-SORAer: `prepared_by = joakim.hoven@norconsult.com`
- Det er kun visningen som er feil

### Løsning

Tre endringer i `src/components/dashboard/SoraAnalysisDialog.tsx`:

**1. Slå opp den opprinnelige skaperens profil**

Etter at `fetchExistingSora()` henter dataene, gjør en tilleggsforespørsel for å hente e-post/navn til brukeren lagret i `existingSora.prepared_by`:

```typescript
const [preparedByProfile, setPreparedByProfile] = useState<{ email?: string; full_name?: string } | null>(null);

// I fetchExistingSora(), etter at data er satt:
if (data?.prepared_by) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('email, full_name')
    .eq('id', data.prepared_by)
    .maybeSingle();
  setPreparedByProfile(profile);
}
```

**2. Vis riktig «Utført av»**

Endre «Utført av»-feltet til å vise den lagrede brukerens e-post/navn hvis SORA allerede eksisterer, og den innloggede brukerens e-post kun for nye analyser:

```tsx
<Input 
  value={existingSora?.prepared_by 
    ? (preparedByProfile?.full_name || preparedByProfile?.email || "Ukjent")
    : (user?.email || "")
  } 
  disabled 
/>
```

**3. Nullstill `preparedByProfile` ved ny analyse**

I `fetchExistingSora()`, i `else`-blokken der `existingSora` settes til `null`, også sette `setPreparedByProfile(null)`.

### Tekniske endringer

**Fil: `src/components/dashboard/SoraAnalysisDialog.tsx`**

- Legg til `preparedByProfile` state
- Utvid `fetchExistingSora()` til å slå opp `prepared_by`-profilen
- Oppdater «Utført av»-feltet til å vise riktig bruker
- Nullstill `preparedByProfile` ved ny/tom analyse

Dette er en ren UI-fix — ingen endringer i databaselogikk eller edge-funksjoner er nødvendig.
