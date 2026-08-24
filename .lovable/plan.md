# Luftromsadvarsler og risikovurdering for oppdrag med flere ruter

## Slik fungerer det i dag (verifisert i koden)

- Når du tegner flere ruter lagres alle i `route.routes[]`, men toppnivåfeltene (`route.coordinates`, `totalDistance`, `areaKm2`) speiler **kun den aktive ruten**.
- Oppdragskortet (`MissionCard`) leser bare `route.coordinates`. Luftromsanalysen (`AirspaceWarnings` → `check_mission_airspace`) kjøres derfor **kun for den aktive ruten**. Ninox-badgen settes av samme kall (`zone_type === '5KM' && is_inside`), altså også bare aktiv rute.
- «Start flytur» gjør det riktig allerede: den henter valgt rutesegment (`selectedRouteId`) og kjører 5 km-sjekken kun på den ruten. Ninox-blokkering gjelder derfor den valgte ruten.
- AI-risikovurdering (`ai-risk-assessment`) leser også bare `mission.route.coordinates` for vær, luftrom, befolkningstetthet og SORA-fotavtrykk — de andre rutene inngår ikke.
- Oppdragsrapport-PDF (`oppdragPdfExport`) samme begrensning: kun aktiv rute.

Kort sagt: i dag er advarsler og risiko «rute-1/aktiv rute», ikke worst case.

## Foreslått oppførsel

1. **Oppdragskort = worst case over alle ruter.**
   Kjør luftromssjekken per rutesegment og slå sammen resultatet: unik liste på sone-ID, høyeste alvorlighetsgrad vinner, og `is_inside` er sann hvis minst én rute er inne. Hver advarsel merkes med hvilke ruter den gjelder («Rute 1», «Anleggsvei» osv.).
2. **Ninox-badge på kortet** vises hvis **minst én** rute er inne i en 5 km-sone (uendret badge-utseende, men teksten/tooltip nevner hvilke ruter).
3. **Start flytur (uendret prinsipp, allerede riktig).** Ninox-advarselen og blokkeringen gjelder kun den valgte ruten. Vi legger til at teksten sier hvilken rute det gjelder, slik at det er tydelig at valg av annen rute kan fjerne kravet.
   `ninox_approved` lagres i dag per oppdrag — dvs. bekreftelse på én rute «låser opp» også andre ruter. Se valg under.
4. **Risikovurdering = worst case.** AI-risikovurderingen kjøres på alle rutesegmenter samlet: befolkningstetthet, luftrom og SORA-fotavtrykk beregnes over alle rutene, og verste verdi driver score. Rapportteksten sier hvilken rute som driver verste funn.
5. **PDF-rapport** får samme aggregerte luftromsliste med rutenavn.

## Åpent valg: Ninox-godkjenning per rute

- Alternativ A (enkelt): behold `ninox_approved` per oppdrag — én bekreftelse dekker hele oppdraget.
- Alternativ B (presist): lagre godkjente rute-ID-er (f.eks. `ninox_approved_routes jsonb`), slik at hver rute i 5 km-sone må bekreftes separat. Kortet viser badgen som godkjent først når alle 5 km-ruter er bekreftet.

## Teknisk

- Ny hjelper `src/lib/missionAirspaceAggregate.ts`: kjører `check_mission_airspace` per segment fra `segmentsFromRouteData`, dedupliserer på `z_id`, tar høyeste severity og samler `routeIds`/`routeLabels`.
- `AirspaceWarnings` får støtte for flere rutesett (`routeSegments`) i tillegg til dagens `routePoints`, og viser rute-chips på hver advarsel.
- `MissionCard` sender alle segmenter, og `has5kmZone` blir «noen rute inne».
- `ai-risk-assessment`: bygg rutepunkter fra `route.routes[]` (fallback til `route.coordinates`), kjør befolknings-/luftromsanalysen per segment og velg verste; prompt oppdateres til å nevne rutenavn.
- Krever migrasjon kun hvis alternativ B velges for Ninox.
