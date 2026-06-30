## Plan

1. **Del dokumenttittelen kontrollert**
   - Lage en liten formatteringshjelper som deler lange filnavn omtrent på midten, helst ved naturlige skilletegn som `_`, `-`, mellomrom eller `.` nær midten.
   - Vise tittelen som to separate linjer i stedet for å stole på browserens automatiske linjebryting.
   - Sørge for at hver linje har `min-w-0`, `max-w-full` og hard word wrapping slik at ingen av linjene kan trekke dialogen bredere enn skjermen.

2. **Behold dialogen innenfor mobilskjermen**
   - Justere `DialogContent` slik at den har trygg mobilbredde og interne elementer kan krympe.
   - Unngå at header, statusbadge eller lukkeknapp presses ut av skjermen.

3. **Gjenopprett horisontal scroll der innholdet faktisk er bredere**
   - Fjerne den globale `overflow-x-hidden` som gjør at du ikke kan scrolle høyre/venstre i dokumentkortet.
   - I stedet begrense bare de elementene som lager uønsket overflow, spesielt tittel og filnavn-linjen.

4. **Fiks filnavn-linjen nederst**
   - Gjøre PDF/filnavn-raden mobiltrygg med `min-w-0` og truncation innenfor dialogen.
   - Knappene “Åpne”, “Last ned” og “Slett dokument” skal ikke presse dialogen horisontalt.

5. **Verifiser mot eksempelet**
   - Teste med filnavn som `3.SORA_Assessment_BVLOS_powerline_...AS_1_m.pdf` på mobilbredde.
   - Bekrefte at tittelen deles omtrent likt over to linjer, dialogen ikke blir bredere enn skjermen, og horisontal scroll ikke blokkeres unødvendig.