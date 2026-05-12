## Problem

I `MissionDetailDialog` (kortet som åpnes fra dashbord, godkjenningsliste osv.) vises kartblokken kun når `mission.latitude && mission.longitude` er satt. Oppdraget «Lerafossen dammer» har ingen gyldig adresse/koordinat, så kartet skjules — selv om en rute (`mission.route.coordinates`) finnes.

`MissionCard` på `/oppdrag` faller allerede tilbake til første rutekoordinat (se linje 572–574). Vi gjør det samme i dialogen.

## Endring

Fil: `src/components/dashboard/MissionDetailDialog.tsx`

1. Beregn én gang per render:
   ```ts
   const routeCoords = (currentMission.route as any)?.coordinates;
   const effectiveLat = currentMission.latitude ?? routeCoords?.[0]?.lat;
   const effectiveLng = currentMission.longitude ?? routeCoords?.[0]?.lng;
   ```
2. Kartblokken (linje 382–408): bytt vilkåret til `effectiveLat && effectiveLng` og send `effectiveLat/effectiveLng` til `MissionMapPreview`. NOTAM-fallback bruker også `effective*`.
3. `ExpandedMapDialog` (linje 488–506): samme vilkår og samme `effective*` props.

Ingen andre filer berøres. Ren UI/presentasjons-endring.
