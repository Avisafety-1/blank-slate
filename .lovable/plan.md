

## Fix: Skjul slett-knapp for hendelse-oppføringer i loggbok

### Problem
Hendelse-oppføringer i loggboken har `type: 'manual'` og `badgeText: 'hendelse'`. Betingelsen `log.type === 'manual'` viser slett-knappen for alle manuelle oppføringer — inkludert hendelser. Brukeren ser dermed kun slett-knappen (rød søppelkasse) i stedet for «åpne hendelse»-knappen.

### Løsning
Ekskluder oppføringer med `incidentId` fra slett-knappen. Hendelse-oppføringer skal kun vise AlertTriangle-knappen for å åpne hendelsen.

### Endring

**`src/components/resources/DroneLogbookDialog.tsx`** (linje 629)
- Endre betingelsen fra `log.type === 'manual'` til `log.type === 'manual' && !log.incidentId`

**`src/components/resources/EquipmentLogbookDialog.tsx`**
- Samme endring for utstyrsloggboken

