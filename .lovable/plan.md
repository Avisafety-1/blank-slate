## Problem

I dag bruker hard-stop-guarden i `ai-risk-assessment/index.ts` den **aggregerte** dronestatusen fra `calculateDroneAggregatedStatus` (i `maintenanceStatus.ts`). Den aggregerte statusen inkluderer tilbehør og *koblet utstyr* (drone_equipment) — så et batteri som er knyttet til dronen men ikke til oppdraget gjør hele dronen "Rød" og trigger HARD STOP. Brukeren vil at koblet utstyr som ikke er valgt på oppdraget kun skal nevnes informativt i Utstyr-seksjonen.

## Endring

1. **`maintenanceStatus.ts`** — la `calculateDroneAggregatedStatus` returnere et ekstra felt `ownStatus` (kun inspeksjonsdato + timer + oppdrag, uten tilbehør/koblet utstyr). Eksisterende `status` (aggregert) beholdes for visning.

2. **`ai-risk-assessment/index.ts` (equipment-guard ~2130-2175)**:
   - Bytt fra `primaryDroneStatusInfo.status` til `primaryDroneStatusInfo.ownStatus` for å avgjøre om dronen er rød/gul i hard-stop-logikken. Samme for `assignedDroneStatuses` (må bære ownStatus — beregnes allerede via samme funksjon).
   - Tilbehør og koblet utstyr som er Rød/Gul men ikke finnes i `assignedEquipment` (mission_equipment) trigger **ikke** hard stop.
   - Legg likevel til en informativ note i `aiAnalysis.categories.equipment.concerns`/`actual_conditions` for disse, med tekst som:  
     `"Batteri 0P2AF9353405RG er knyttet til dronen men ikke valgt på dette oppdraget — antas ikke brukt."`
   - Hard stop trigges fortsatt hvis: dronens egen inspeksjon/timer/oppdrag er forfalt, ELLER et utstyr i `assignedEquipment` er Rødt.

3. **Kort konklusjonstekst** fra forrige endring beholdes uendret (kun overordnet i hard_stop_reason/summary, detaljer i utstyr-kortet).

Ingen DB-endringer.
