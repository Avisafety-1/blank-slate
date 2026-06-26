Plan:

1. Oppdater pane-synk i `OpenAIPMap.tsx`
   - Legg `atzPane` inn i listen som får `pointer-events: none` når `mode === "routePlanning"`.
   - Dette er sannsynligvis feilen: `atzPane` finnes i init-listen, men mangler i den senere `useEffect`-listen som kjører når modus endres.

2. Stram inn flyplasslagene i `mapDataFetchers.ts`
   - Bekreft at både OpenAIP-flyplassmarkører (`airportPane`) og CAA småflyplass-sirkler (`atzPane`) rendres som ikke-interaktive i rutemodus.
   - Ved behov juster CAA småflyplass-sirkler slik at `bubblingMouseEvents` ikke hindrer kartklikk i rutemodus.

3. Verifiser i kartet
   - Start rutemodus, klikk på/innenfor en småflyplass/5 km-sone under «Flyplasser», og sjekk at rutepunkt opprettes.
   - Sjekk samtidig at inspeksjonsmodus fortsatt lar brukeren klikke soner for info når den er aktiv.