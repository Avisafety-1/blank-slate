

## Krev Dronetag-valg for Live UAV-modus

### Hva
Dronetag-velgeren i Live UAV-modus skal være **obligatorisk**, ikke valgfri. Man kan ikke starte flyging i Live-modus uten å ha valgt en Dronetag-enhet.

### Endringer i `src/components/StartFlightDialog.tsx`

1. **Fjern "(Valgfritt)"-teksten** fra Dronetag-velgerens label (linje 1064) -- vis bare `t('flight.dronetagDevice')` uten `(${t('common.optional')})`.

2. **Vis Dronetag-velgeren alltid i live_uav-modus** -- fjern `dronetagDevices.length > 0`-sjekken (linje 1062). Hvis ingen enheter finnes, vis en melding om at man må legge til en Dronetag først.

3. **Fjern "Ingen"-alternativet** fra dropdown (linje 1076, `SelectItem value="none"`).

4. **Deaktiver Start-knappen** når `publishMode === 'live_uav'` og ingen gyldig Dronetag er valgt:
   - Legg til `(publishMode === 'live_uav' && (!selectedDronetagId || selectedDronetagId === 'none'))` i `disabled`-betingelsen på linje 1143.

5. **Vis varsel hvis ingen Dronetag-enheter finnes** -- når `dronetagDevices.length === 0` og `publishMode === 'live_uav'`, vis en advarsel: "Ingen Dronetag-enheter registrert. Legg til en under Ressurser."

### Resultat
- Live UAV-modus krever obligatorisk Dronetag-valg
- Autoselect fra oppdrag fungerer som før
- Tydelig tilbakemelding hvis ingen enheter er tilgjengelige

