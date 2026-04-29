Jeg fant at databasen allerede viser riktig verdi for `kontakt@avisafe.no`:

```text
under_training = false
training_module_access = ['documents']
```

Årsaken til at profilen fortsatt bare ser Dokumenter er sannsynligvis frontend-cache: `AuthContext` bruker lokal profilcache i opptil 5 minutter og hopper over full profilrefresh ved reload. Da kan gammel `underTraining=true` + kun dokumenttilgang bli liggende i UI selv om databasen er oppdatert.

Plan for å fikse dette:

1. Gjør opplæringstilgang mindre sårbar for cache
   - Endre oppstarten i `AuthContext` slik at den ikke stoler på fersk cache for feltene `under_training` og `training_module_access` når brukeren er online.
   - La appen fortsatt bruke cache for rask visning/offline, men kjør alltid en lett profilrefresh for tilgangsstyring ved oppstart/sign-in.

2. Oppdater innlogget bruker umiddelbart hvis admin endrer egen profil
   - I Admin-siden: etter toggle av «Under opplæring» eller endring av modultilgang, kall `refetchUserInfo()` dersom endringen gjelder aktiv innlogget bruker.
   - Dette gjør at header, dashboard-widgets og rutevakter oppdateres uten logout/reload.

3. Rydd tilgangsdata når «Under opplæring» slås av
   - Når togglen slås av, sett samtidig `training_module_access` til tom liste i profilen.
   - Ikke nødvendig for tilgangslogikken når `under_training=false`, men det fjerner forvirrende restdata som `['documents']` i databasen og admin-UI.

4. Legg inn sikkerhetsnett i `hasTrainingModuleAccess`
   - Behold regelen: hvis `underTraining=false`, returner alltid full tilgang.
   - Sørg for at alle komponenter får oppdatert context etter refresh, slik at de ikke baserer seg på gammel `trainingModuleAccess`.

5. Verifisering etter endring
   - Sjekk at `kontakt@avisafe.no` med `under_training=false` får se alle hovedmeny-moduler.
   - Sjekk at «Start flyging» vises igjen når «Under opplæring» er av.
   - Sjekk at når togglen slås på igjen, vises bare valgte moduler og «Start flyging» skjules.