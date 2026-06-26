Plan:

1. Innfør én felles hjelpefunksjon i `OpenAIPMap.tsx` for rutemodus-interaktivitet
   - Den skal sette `pointer-events: none/auto` på pane-nivå.
   - Den skal også gå gjennom eksisterende Leaflet-lag og deaktivere/aktivere interaktive targets der Leaflet allerede har registrert markører, sirkler og GeoJSON-paths.

2. Bruk hjelpefunksjonen på alle kartlag som skal slippe klikk gjennom i ruteplanlegging
   - Behold eksisterende oppførsel for lag som allerede fungerer.
   - Utvid spesielt til `airportsLayer` og `caaFlyplasserLayer`, siden “Flyplasser” består av begge.
   - Inkluder både `airportPane` og `atzPane`, men ikke stol bare på pane-stil, fordi Leaflet-markører kan ha egne event-targets.

3. Juster rendering av flyplasslagene til samme mønster som de andre lagene
   - Sørg for at CAA-småflyplass-sirkler og flyplassmarkører får `interactive: false` når kartet er i rutemodus.
   - Fjern/unngå `bubblingMouseEvents: false` i rutemodus der det kan stoppe kartklikk fra å nå map click handler.
   - La “Inspiser”-modus fortsatt kunne åpne popup/info når brukeren aktivt velger inspeksjon.

4. Verifiser manuelt med Playwright etter implementering
   - Åpne `/kart`, aktiver ruteplanlegger, klikk på/innenfor småflyplasslaget.
   - Bekreft at rutepunkt opprettes.
   - Slå på Inspiser og bekreft at klikk ikke legger rutepunkt, men kan brukes til info på soner.