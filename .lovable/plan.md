

# Flervalg i ressurs-dropdowns ved oppdragsopprettelse

## Problem

Når man velger personell, utstyr eller droner i oppdragsdialogen, lukkes dropdown-menyen etter hvert enkelt valg. Dette gjør det tungvint å velge flere ressurser.

## Løsning

Fjerne de fire linjene i `AddMissionDialog.tsx` som tvinger popover-ene til å lukke seg etter hvert valg:

- Linje 690: `setOpenPersonnelPopover(false)` -- fjernes fra `togglePersonnel`
- Linje 703: `setOpenEquipmentPopover(false)` -- fjernes fra `toggleEquipment`
- Linje 716: `setOpenDronePopover(false)` -- fjernes fra `toggleDrone`
- Linje 729: `setOpenDocumentPopover(false)` -- fjernes fra `toggleDocument`

Brukeren kan da velge flere elementer fritt og lukke dropdown-en manuelt ved å klikke utenfor eller trykke Escape.

## Fil som endres

| Fil | Endring |
|---|---|
| `src/components/dashboard/AddMissionDialog.tsx` | Fjerne 4 linjer som lukker popover etter valg |

