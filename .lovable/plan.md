## Plan

1. Lag én ny database-migrasjon som erstatter `public.sync_mission_map_publication()` med samme logikk som nå, men korrigerer profiloppslaget til kun eksisterende kolonner:
   - `telefon`
   - `email`
   - `full_name`

2. Fjern referansen til `display_name`, fordi `profiles.display_name` ikke finnes og nå blokkerer `INSERT/UPDATE` på `missions` med `column "display_name" does not exist`.

3. Behold eksisterende personvernlogikk uendret:
   - kontaktinfo vises bare når `share_contact_info=true` og `anonymous_publish=false`
   - ellers lagres publiserte kontaktfelter som `NULL`
   - ingen offentlig/anon-visning aktiveres
   - ingen RLS-endringer
   - ingen nye tabeller eller kolonner

4. Etter migrasjonen: verifiser at selve triggerdefinisjonen ikke lenger inneholder `display_name` eller `phone`, og at den bruker `telefon`, `email`, `full_name`.