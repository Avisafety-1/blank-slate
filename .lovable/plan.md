## Plan

1. **Begrens dialogen hardt til mobilskjermen**
   - Oppdater `DocumentDetailDialog` slik at dialogen bruker en trygg mobilbredde (`calc(100vw - margin)`) og skjuler horisontal overflow.
   - Sørg for at interne flex-rader kan krympe (`min-w-0`) i stedet for å presse dialogen bredere.

2. **Del lange dokumenttitler korrekt**
   - Gjør tittelen til et eget krympbart tekstfelt med `max-w-full`, `whitespace-normal`, `break-all`/`overflow-wrap:anywhere` og maks 2 linjer på mobil.
   - Lange filnavn med `_`, punktum og uten mellomrom skal brytes inne i ordet, slik at tittelen ikke skyver lukkeknappen eller dialogbredden.

3. **Fiks filnavn og knapperekke nederst**
   - Gjør filnavn-linjen krympbar og trunkert innenfor dialogen.
   - På små skjermer skal “Åpne” og “Last ned” kunne stables eller krympe uten å lage horisontal scroll.

4. **Verifiser mot skjermbildet**
   - Test med et langt SORA/PDF-filnavn på mobilbredde og bekreft at dialogen holder seg innenfor skjermen, tittelen brytes i to linjer, og knappene ikke presses utenfor.