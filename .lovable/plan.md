## Problem

I "Foreslått konklusjon" og "HARD STOP"-banneret vises full teknisk streng med serienummer og ISO-tidsstempel (`2026-06-06T00:00:00+00:00`). Disse detaljene hører hjemme nede i Utstyr-kortet, ikke i toppkonklusjonen.

Kilde: `supabase/functions/ai-risk-assessment/index.ts` linje 2153-2175 (equipment hard-stop guard). I dag settes både `hard_stop_reason` og `summary` til hele `reasonText` (med SN + datoer), og det er denne teksten UI-et viser i banneret/konklusjonen.

## Endring

I equipment-guarden (index.ts ~2153-2175):

1. Lag en kort overskriftstekst for konklusjon/hard stop:
   - 1 rød drone: `"Forfalt vedlikehold/inspeksjon på dronen"`
   - Flere røde droner: `"Forfalt vedlikehold/inspeksjon på N droner"`
   - Kun utstyr rødt: `"Forfalt vedlikehold på tilkoblet utstyr"`
   - Kombinert: `"Forfalt vedlikehold/inspeksjon på drone og tilkoblet utstyr"`

2. Bruk denne korte teksten i:
   - `aiAnalysis.hard_stop_reason`
   - `aiAnalysis.summary` (prepend kort tekst, ikke full reasonText)

3. Behold den detaljerte `reasonText` (med SN + datoer) kun i:
   - `aiAnalysis.categories.equipment.actual_conditions`
   - `aiAnalysis.categories.equipment.concerns`
   
   Slik at brukeren ser detaljene når de scroller ned til Utstyr-kortet.

4. Rens også ISO-tidsstempel fra datoer som vises: konverter `2026-06-06T00:00:00+00:00` → `2026-06-06` i `reasons`-strenger fra `calculateDroneAggregatedStatus` (i `maintenanceStatus.ts` linje 130: `Inspeksjonsdato (${drone.neste_inspeksjon}) → ${dateS}` — formater datoen som YYYY-MM-DD før interpolasjon).

Ingen andre filer eller logikk endres. Ingen DB-endringer. Edge function re-deployes automatisk.
