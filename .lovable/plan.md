## Mål
I dialogen for nytt/rediger oppdrag (`AddMissionDialog`) skal seksjonen "Kartpublisering" flyttes ut av sin nåværende plass (rett under konfliktvarsel, midt i skjemaet) og legges nederst, rett over Avbryt / Opprett oppdrag-knappene, pakket i en ekspanderbar boks som er **lukket som standard**.

## Endring (kun frontend)

**Fil:** `src/components/dashboard/AddMissionDialog.tsx`

1. Fjern blokken på linje 1317–1321 (`<MissionPublicationSection ... />`).
2. Sett inn en `<Collapsible>`-pakket versjon rett før knapperaden på linje 1705, med samme stil som de ekspanderbare under-seksjonene i admin (border-2, border-primary/30, ChevronDown som roterer):

```tsx
<Collapsible defaultOpen={false}>
  <div className="rounded-lg border-2 border-primary/30 bg-muted/20 overflow-hidden">
    <CollapsibleTrigger className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/40 transition-colors group">
      <div className="flex items-center gap-2 font-medium text-sm">
        <Map className="h-4 w-4 text-muted-foreground" />
        <span>Kartpublisering</span>
      </div>
      <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
    </CollapsibleTrigger>
    <CollapsibleContent>
      <div className="px-3 pb-3 pt-1 border-t border-primary/20">
        <MissionPublicationSection
          values={publication}
          onChange={setPublication}
          allowOverride={companySettings.allow_pilot_override_publish_settings}
        />
      </div>
    </CollapsibleContent>
  </div>
</Collapsible>
```

3. Sjekk at `Collapsible / CollapsibleTrigger / CollapsibleContent`, `ChevronDown` og `Map` allerede er importert; ellers legg til imports.

## Out of scope
- Ingen endringer i `MissionPublicationSection` selv.
- Ingen DB- eller trigger-endringer.
- Ingen endring av default-verdier eller validering.