

## Plan: Gjør opplæringsmodulen tilgjengelig for alle selskaper

### Problem
I `src/pages/Admin.tsx` (linje 1392–1408) vises `<TrainingSection />` kun hvis `isSuperAdmin` er sann. Alle andre admins ser meldingen "Side under utvikling … kun tilgjengelig for utvalgte selskaper". Dette gjør at kun Avisafe-superadmins får brukt opplæringsmodulen.

### Løsning
Fjerne `isSuperAdmin`-gaten i `TabsContent value="training"` slik at alle admins (i alle ikke-underavdelings-selskaper) får tilgang til `<TrainingSection />`. Beholdes:
- `!isChildCompany`-betingelsen (underavdelinger får fortsatt kun arvet visning som i dag — uendret)
- Interne superadmin-spesifikke kontroller inne i `TrainingSection` (f.eks. "Tilgjengelig for alle"-globaltoggle på linje 448 `isSuperAdmin && isOwner`) — disse forblir kun for Avisafe-superadmins

### Endringer

**`src/pages/Admin.tsx` (linje 1392–1408)**
Erstatt:
```tsx
{!isChildCompany && (
  <TabsContent value="training" className="mt-4 sm:mt-8">
    {isSuperAdmin ? (
      <TrainingSection />
    ) : (
      <div className="...">Side under utvikling ...</div>
    )}
  </TabsContent>
)}
```
med:
```tsx
{!isChildCompany && (
  <TabsContent value="training" className="mt-4 sm:mt-8">
    <TrainingSection />
  </TabsContent>
)}
```

### Sjekket / ikke endret
- **RLS på `training_courses`, `training_course_folders`, `training_questions`, `training_assignments`**: Modulen er allerede skrevet for å fungere multi-selskap (filtrerer på `companyId`, viser `available_to_all`-globale kurs på tvers, og merker `inherited`/`isOwner`). Ingen migrasjon nødvendig.
- **Globale kurs-toggle**: Beholdes superadmin-only via eksisterende `isSuperAdmin && isOwner`-sjekk i `TrainingSection.tsx`.
- **Faneknapp** (`TabsTrigger value="training"`): Allerede synlig for alle ikke-underavdelinger, ingen endring.

### Resultat
Alle administratorer i hovedselskaper får full tilgang til opplæringsmodulen — opprette mapper, lage kurs, tildele til ansatte og se status — på samme måte som Avisafe har i dag. Globale (kryss-selskap) kurs administreres fortsatt kun av Avisafe-superadmins.

