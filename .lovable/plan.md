

# Fiks "Påvirker status"-toggle som ikke viser endring

## Problem
Når brukeren trykker på "Påvirker status"-bryteren i visningsmodusen til et kompetansekort, oppdateres databasen korrekt, men den lokale tilstanden oppdateres ikke. Siden `checked`-egenskapen til Switch-komponenten leser fra den lokale `person`-tilstanden, spretter bryteren visuelt tilbake til sin opprinnelige posisjon umiddelbart etter klikk.

## Losning
Legge til en optimistisk oppdatering av den lokale `person`-tilstanden i `onCheckedChange`-handleren, slik at bryteren visuelt reflekterer endringen umiddelbart.

## Tekniske detaljer

**Fil:** `src/components/resources/PersonCompetencyDialog.tsx`

I `onCheckedChange`-handleren (linje 417-431), legge til optimistisk oppdatering av `person`-state for bryteren viser endringen umiddelbart:

```tsx
onCheckedChange={async (checked) => {
  // Optimistisk oppdatering av lokal state
  setPerson(prev => {
    if (!prev) return prev;
    return {
      ...prev,
      personnel_competencies: (prev.personnel_competencies || []).map(c =>
        c.id === competency.id ? { ...c, påvirker_status: checked } : c
      ),
    };
  });

  const { error } = await supabase
    .from("personnel_competencies")
    .update({ påvirker_status: checked })
    .eq("id", competency.id);
  if (error) {
    // Reverser ved feil
    setPerson(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        personnel_competencies: (prev.personnel_competencies || []).map(c =>
          c.id === competency.id ? { ...c, påvirker_status: !checked } : c
        ),
      };
    });
    toast({
      title: "Feil",
      description: "Kunne ikke oppdatere innstilling",
      variant: "destructive",
    });
  } else {
    onCompetencyUpdated();
  }
}}
```

Dette er en enkelt endring i en fil som sikrer at bryteren visuelt oppdateres umiddelbart (optimistisk), og reverserer dersom databaseoppdateringen feiler.

