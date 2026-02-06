

## Kopiere oppdraget "Demo dronetag" til Avisafe

### Hva som skal kopieres

Oppdraget "Demo dronetag" fra UAS Voss inneholder:
- **Oppdragsdata**: Tittel, lokasjon (Voss), beskrivelse, rute (4 koordinater, 0.42 km2, 3.2 km), risikoniva (Lav), status (Fullfort)
- **Tilknyttet drone**: Matrice 4 E (finnes ikke hos Avisafe)
- **Tilknyttet personell**: Kenneth Kleppe (tilhorer UAS Voss)
- **Flylogg**: 1 flylogg med 140 track-punkter fra DroneTag, 12 min flytid
- **DroneTag-enhet**: "AviSafe DroneTag" (tilhorer UAS Voss)
- **Risikovurdering (AI)**: Fullstendig AI-analyse med score 8/10
- **Ingen utstyr** tilknyttet
- **Ingen SORA-analyse**

### Utfordringer og losning

Avisafe har ikke samme drone, pilot eller DroneTag-enhet. Her er strategien:

| Ressurs | UAS Voss | Avisafe-losning |
|---------|----------|-----------------|
| Drone (Matrice 4 E) | Finnes | Kopieres UTEN drone-tilknytning. Bruker kan selv velge drone etterpå |
| Personell (Kenneth Kleppe) | Finnes | Kopieres UTEN personell. Bruker kan selv tilknytte |
| DroneTag-enhet | Finnes hos UAS Voss | Ikke tilgjengelig. Kopieres uten |
| Flylogg med trackdata | 140 punkter | Kopieres MED trackdata, men uten drone_id og dronetag_device_id |
| Risikovurdering | AI-analyse | Kopieres som den er (historisk referanse) |
| Rute | 4 koordinater | Kopieres identisk |

### Gjennomforing (SQL-operasjoner)

Jeg vil utfore folgende steg via direkte database-operasjoner (ingen kodeendring nodvendig):

1. **Opprett nytt oppdrag** i `missions`-tabellen med Avisafe sin `company_id`, same rute, lokasjon og beskrivelse. Tittel settes til "Demo dronetag (kopi)".

2. **Kopier flyloggen** til `flight_logs` med:
   - Avisafe sin `company_id`
   - `drone_id` satt til `NULL` (ingen tilsvarende drone)
   - `dronetag_device_id` satt til `NULL` (ingen DroneTag hos Avisafe)
   - `user_id` satt til en Avisafe-bruker (f.eks. admin-bruker)
   - Alle track-punkter (`flight_track`) beholdes intakt

3. **Kopier risikovurderingen** til `mission_risk_assessments` med referanse til det nye oppdraget.

4. **IKKE kopier**: mission_drones, mission_personnel (ingen matchende ressurser hos Avisafe)

### Resultat

Etter kopiering vil Avisafe ha:
- Et fullfort oppdrag med komplett rute og kartdata
- Flylogg med 140 DroneTag track-punkter (synlig pa kartet)
- AI-risikovurdering som historisk referanse
- Mulighet til a knytte egne droner og personell til oppdraget i etterkant

### Teknisk detalj

Alle operasjoner er rene data-innsettinger (INSERT) i databasen. Ingen kodeendringer er nodvendige. RLS-policies vil automatisk sikre at dataen kun er synlig for Avisafe-brukere.

