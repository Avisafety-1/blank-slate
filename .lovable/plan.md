Jeg ser årsaken: risikovurderingen har hittil vært for avhengig av AI-ens tolkning av drone-/utstyrsstatus. Selv om UI viser dronen som Rød basert på forfalt neste inspeksjon/vedlikehold, kan AI-resultatet fortsatt ende med GO hvis den får eller bruker den statiske DB-statusen som «Grønn», eller hvis den ignorerer datoen i teksten.

Plan:
1. Gjør vedlikeholdsstatus autoritativ før AI-kallet
   - Beregn status for primærdrone, alle tildelte droner og tildelt utstyr med samme logikk som UI: forfalt dato, timeintervall, oppdragsintervall, tilbehør og koblet utstyr.
   - Sørg for at både moderavdeling og underavdelinger bruker samme beregning, uavhengig av hva `drones.status` står som.

2. Legg inn deterministisk sikkerhetsvakt etter AI-svaret
   - Hvis beregnet primærdrone/tildelt drone/kritisk utstyr er Rød, skal funksjonen overstyre AI-resultatet til:
     - `equipment.go_decision = NO-GO`
     - lav utstyrsscore
     - `hard_stop_triggered = true`
     - `recommendation = no-go`
   - Begrunnelsen skal komme fra den beregnede årsaken, f.eks. «Inspeksjonsdato 2026-06-06 er forfalt».

3. Gjør AI-teksten umulig å motsi serverstatus
   - Hvis AI skriver «neste inspeksjon er godt innenfor fristen» når datoen er forfalt, fjernes/erstattes dette i serverens etterkontroll.
   - Resultatvisningen skal dermed ikke kunne vise grønn tekst for en rød drone.

4. Test mot eksempelet i skjermbildet
   - Verifiser at DJI Matrice 350 RTK med neste inspeksjon 2026-06-06 blir Rød/NO-GO i risikovurderingen.
   - Sjekk også at en drone med Gul status ikke blir hard-stop, men gir redusert score og forsiktighetsanbefaling.

Ingen databaseendringer trengs.