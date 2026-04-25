Jeg lager en ny PDF-dokumentasjon som beskriver hvordan AI-risikovurderingen i AviSafe fungerer fra start til slutt, uten å omtale endringshistorikk.

Dokumentet vil dekke:

1. Formål og avgrensning
   - At AI-risikovurderingen er beslutningsstøtte for pilot/operatør, ikke en automatisk erstatning for pilot-in-command sin operative vurdering.
   - Skille mellom ordinær AI-risikovurdering og SORA re-vurdering/SORA-output.

2. Full dataflyt
   - Pilot-input fra dialogen: flyhøyde, operasjonstype, VLOS/BVLOS, observatører, nærhet til mennesker, ATC, kritisk infrastruktur, backup-landingsplass og eventuelt hopp over vær.
   - Oppdragsdata: lokasjon, tidspunkt, rute, kunde og eventuell eksisterende SORA.
   - Ressursdata: tildelte piloter, kompetanser, flylogg/recency, drone, utstyr og vedlikeholdsstatus.
   - Selskapsdata fra SORA-admin: hardstop-grenser, operative begrensninger, policy-notater, dokumentreferanser og auto-godkjenning.

3. Datakilder og grunnlag
   - MET Norway Locationforecast via drone-weather-funksjonen for vær, inkludert temperatur, vind, vindkast, sikt/nedbør og duggpunkt.
   - NOAA Space Weather Prediction Center for Kp-indeks/geomagnetisk aktivitet.
   - OpenAIP / interne luftromsdata via `check_mission_airspace` for luftrom, CTR/TIZ, restriksjonsområder mv.
   - SSB Arealbruk WFS for kvalitativ bakkeklassifisering.
   - SSB befolkning på rutenett (`befolkning_1km_2025`) for AI-risikovurderingens rutenære befolkningstetthet.
   - Operatørens egne data i AviSafe: oppdrag, kompetanser, flylogger, droner, utstyr, dokumenter og SORA-admin.

4. Beregninger og vurderingslogikk
   - Score-skala 1–10 der høy score betyr lav risiko.
   - Fem kategorier: vær, luftrom, utstyr, pilot/kompetanse og oppdragskompleksitet.
   - Hardstop-logikk som overstyrer score og gir NO-GO ved absolutte brudd.
   - Hvordan duggpunkt-differanse vurderes: liten differanse gir økt risiko.
   - Kp-indeks: Kp 0–4 ingen trekk, Kp 5–6 trekk i vær og utstyr, Kp ≥ 7 større trekk og mulig caution/no-go.
   - Befolkningstetthet: terskler for spredt/befolket/tett befolket og hvordan dette påvirker bakkesrisiko.
   - Pilot-recency, kompetanse og utløpte sertifikater.
   - Drone-/utstyrsstatus og vedlikehold.

5. SORA-metodikk i AI-flyten
   - Kategorisering: Åpen, STS eller Spesifikk kategori.
   - Når SORA kreves, spesielt BVLOS, over 120 m, utenfor åpen/STS eller som selskapskrav.
   - ALOS-beregning fra karakteristisk dimensjon.
   - Bakkerisiko: iGRC, mitigeringer M1/M2 og fGRC.
   - Luftrisiko: AEC, ARC, strategiske mitigeringer, residual ARC og TMPR.
   - SAIL-oppslag fra fGRC og ARC.
   - Containment-robusthet og OSO-krav.

6. SORA-admin
   - Hvordan selskapsspesifikke innstillinger overstyrer standardverdier.
   - Hvilke verdier som er absolutte hardstop: vind, vindkast, sikt, temperatur, flyhøyde, BVLOS, nattflyging, pilotinaktivitet, befolkningstetthet, reservebatteri, observatør og sivil skumring.
   - Arv fra morselskap/avdeling.
   - Operative begrensninger og AI-lesbare policy-notater.
   - Viktig begrensning: AI leser ikke innholdet i PDF/Word direkte, kun metadata og tekst som er limt inn som policy-notater.
   - SORA-basert auto-godkjenning: scoreterskel, hardstop-regel og status `approved` / `not_approved`.

7. Prioritering og vekting
   - Absolutte hardstop prioriteres høyest.
   - Deretter regulatoriske krav/SORA-krav.
   - Deretter direkte operative forhold som vær, luftrom og utstyr.
   - Deretter kompetanse/recency og kompleksitet.
   - Positiv pilot-erfaring kan ikke kompensere for hardstop, teknisk rød status eller meteorologiske overskridelser.

8. Kilder
   - Luftfartstilsynet / CAA Norway SORA 2.5-kalkulator og veiledning.
   - EASA-regelverk for UAS, særlig forordning (EU) 2019/947 og 2019/945.
   - JARUS SORA 2.5 for iGRC/fGRC, ARC, SAIL, containment og OSO.
   - MET Norway API.
   - NOAA SWPC Kp-index forecast.
   - SSB/Geonorge WFS-kilder for arealbruk og befolkning på rutenett.

Leveranse etter godkjenning:
- Jeg genererer PDF-en i `/mnt/documents/`, for eksempel `ai-risikovurdering-dokumentasjon.pdf`.
- Jeg konverterer alle PDF-sider til bilder og kontrollerer visuelt at layout, tabeller, norske tegn, kildehenvisninger og sideskift er korrekte før jeg leverer filen.