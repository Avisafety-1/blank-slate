
# Manuelle kommentarer per kategori i AI-risikovurdering

## Oversikt
Legge til muligheten for at brukeren kan skrive en manuell kommentar under hver kategori (Vaer, Luftrom, Utstyr, Piloterfaring, Oppdragskompleksitet) i risikovurderingen. Kommentarene lagres i databasen sammen med vurderingen.

## Endringer

### 1. Database - ny kolonne
Legge til en `pilot_comments` JSONB-kolonne i `mission_risk_assessments`-tabellen. Denne vil lagre kommentarer som et objekt med kategorinavn som noekler:
```json
{
  "weather": "Sjekket lokalt, vindforhold akseptable",
  "airspace": "Kontaktet taarnet, klarert",
  "equipment": "",
  "pilot_experience": "",
  "mission_complexity": "Komplekst terreng krever ekstra oppmerksomhet"
}
```

### 2. RiskScoreCard-komponenten
- Legge til en ny prop `categoryComments` (objekt med kategorinavn som nokler og kommentarstreng som verdi) og `onCategoryCommentChange` callback.
- Under hver kategori-boks, legge til et Textarea-felt med placeholder "Legg til kommentar..." som lar brukeren skrive en manuell kommentar.
- Kommentarene vises med `readOnly`-styling nar man ser pa historiske vurderinger (der kommentarene allerede er lagret).

### 3. RiskAssessmentDialog-komponenten
- Legge til en ny state `categoryComments` som holder brukerens kommentarer per kategori.
- Sende `categoryComments` og `onCategoryCommentChange` ned til `RiskScoreCard`.
- Legge til en "Lagre kommentarer"-knapp som oppdaterer `pilot_comments`-kolonnen i databasen via Supabase.
- Nar en historisk vurdering lastes, populere `categoryComments` fra den lagrede `pilot_comments`-verdien.

### 4. Edge function (ai-risk-assessment)
- Oppdatere insert-kallet til a inkludere `pilot_comments: {}` som standardverdi (tom).

## Tekniske detaljer

**Ny migrering:**
```sql
ALTER TABLE mission_risk_assessments 
ADD COLUMN pilot_comments jsonb DEFAULT '{}'::jsonb;
```

**RiskScoreCard.tsx** - Nye props:
```typescript
interface RiskScoreCardProps {
  // ...eksisterende props
  categoryComments?: Record<string, string>;
  onCategoryCommentChange?: (category: string, comment: string) => void;
  readOnly?: boolean;
}
```

Under hver kategori-boks (etter factors/concerns), legges et Textarea:
```tsx
<Textarea
  placeholder="Legg til kommentar..."
  value={categoryComments?.[key] || ''}
  onChange={(e) => onCategoryCommentChange?.(key, e.target.value)}
  readOnly={readOnly}
  className="mt-2 text-xs min-h-[60px]"
/>
```

**RiskAssessmentDialog.tsx** - Ny state og lagringsfunksjon:
```tsx
const [categoryComments, setCategoryComments] = useState<Record<string, string>>({});

const saveComments = async (assessmentId: string) => {
  await supabase
    .from('mission_risk_assessments')
    .update({ pilot_comments: categoryComments })
    .eq('id', assessmentId);
};
```

Nar historisk vurdering lastes, hentes `pilot_comments` fra databasen og settes i state. `loadPreviousAssessments` ma oppdateres til a inkludere `pilot_comments` i select-sporringen.

**Lagre-knapp** legges under RiskScoreCard i resultat-fanen, slik at brukeren kan lagre kommentarene etter at de er skrevet.
