# Feilsøk manglende MQTT-posisjoner

## Bekreftet nå

- «Tensio»-dronen har nå eksakt serienummer `1581F8DBW255D00A2M0U` i feltet **serienummer**.
- Dette matcher MQTT-temaet nøyaktig.
- Det finnes fortsatt **0** rader med dette serienummeret i `flighthub2_positions`.
- Broker-loggen bekrefter bare at meldingen videresendes til `avisafe-bridge`; den viser ikke om bridgen lykkes med databaseoppslag eller innsetting.
- Bridgen cacher et mislykket serienummeroppslag i fem minutter. En allerede kjørende prosess kan derfor fortsette å forkaste Tensio-data i opptil fem minutter etter rettingen.

## Plan

1. **Gjør oppslagsfeil tydelige i `mqtt-broker/bridge.py`**
   - Skill mellom «serienummer finnes ikke», feil svar fra Supabase og nettverksfeil.
   - Ikke rapporter Supabase-/nettverksfeil som `unresolved_sn`.
   - Kort ned negativ cache til 30 sekunder; behold fem minutter for vellykkede oppslag.

2. **Legg til synlig bekreftelse på vellykket behandling**
   - Logg når serienummeret er koblet til riktig drone og selskap.
   - Logg første vellykkede innsetting og deretter periodisk, uten å fylle Fly-loggen hvert andre sekund.
   - Behold responskode og en avgrenset feilmelding ved mislykket innsetting.

3. **Behold eksakt serienummer som hovedregel**
   - Tensio skal nå treffe direkte uten prefikslogikk.
   - Ingen automatisk prefiks-matching innføres nå, siden like prefikser finnes på tvers av selskaper og kan gi feil selskapskobling.

4. **Verifiser etter ny Fly-deploy**
   - Kontroller loggene for selve `bridge`-prosessen, ikke bare `mosquitto`.
   - Bekreft at oppslaget returnerer Tensios `drone_id` og `company_id`.
   - Bekreft nye rader i `flighthub2_positions` med `sn = 1581F8DBW255D00A2M0U`.

## Umiddelbar kontroll før kodeendringen

Vent maksimalt fem minutter fra serienummeret ble lagret, eller restart kun `bridge`-maskinen for å tømme cachen. Hvis det fortsatt ikke kommer rader, er de nye bridge-loggene nødvendige for å skille mellom manglende/feil `SUPABASE_URL`, manglende/feil `SUPABASE_SERVICE_ROLE_KEY`, oppslagsfeil og insert-feil.

## Omfang

Kun `mqtt-broker/bridge.py` og tilhørende dokumentasjon endres. Ingen database-, edge function- eller frontendendringer.
