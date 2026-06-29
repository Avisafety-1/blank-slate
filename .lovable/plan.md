## Kvalitetssikring

**Funksjonen:** `public.check_mission_airspace(p_lat, p_lng, p_route)` finnes i én signatur. Endringen er `CREATE OR REPLACE` med samme signatur — ingen duplikater eller overload-konflikt.

**Eksisterende mønster:** `is_official` brukes allerede:
- Migrasjon `20260424163401_…` markerer klubb-/seilfly-/modellfly-ATZ som `is_official=false`.
- `src/lib/aipZoneCache.ts` filtrerer allerede `.eq('is_official', true)` for kart-rendring.

Vår SQL legger til samme filter (`AND az.is_official = true`) i ATZ_5KM-grenen — konsistent, ikke motstridende.

**Datakontroll:** 13 ATZ totalt — 12 uoffisielle (klubber: GAULDAL, EGGEMOEN, GVARV, STARMOEN) og 1 offisiell (Harstad/Narvik Evenes). Etter endringen vil bare Evenes gi ATZ_5KM-treff fra `aip_restriction_zones`. Ekte småflyplasser kommer fortsatt fra `caa_drone_zones`-grenen (dronesoner.no, layer `flyplasser`, type `Fly`) — uendret. Ler flyplass beholdes derfor.

**Bivirkninger:** Ingen. RLS, policies, grants, triggere og andre funksjoner berøres ikke. Edge functions / `mapDataFetchers` påvirkes ikke.

**Risiko:** Lav. Eneste endring i atferd er at GAULDAL/EGGEMOEN/GVARV/STARMOEN-klubbsoner ikke lenger flagges som «5 km småflyplass med PPR». Disse er likevel synlige i kartet som ATZ-luftrom via vanlig AIP-rendering.

**Konklusjon:** Trygt å kjøre. Klar til å sende migrasjonen.
