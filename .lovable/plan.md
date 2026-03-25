

## Plan: Velg modell fra katalog ved redigering av drone

### Hva
Legge til en «Velg fra katalog»-dropdown i redigeringsmodus i DroneDetailDialog, slik at brukeren kan velge en dronemodell fra `drone_models`-tabellen. Når en modell velges, fylles klasse, vekt (MTOM), payload og merknader automatisk ut — akkurat som det allerede fungerer i AddDroneDialog.

### Endringer

**Fil: `src/components/resources/DroneDetailDialog.tsx`**

1. Legg til state for `droneModels` (liste) og `selectedModelId` (valgt katalogmodell)
2. Fetch `drone_models` fra Supabase når redigeringsmodus aktiveres (samme mønster som AddDroneDialog)
3. Legg til en `handleModelSelect`-funksjon som fyller ut `formData.modell`, `formData.klasse`, `formData.vekt`, `formData.payload` og `formData.merknader` fra den valgte katalogmodellen
4. I redigeringsskjemaet: legg til en Select-dropdown **over** modell-feltet med label «Velg fra katalog» der brukeren kan velge en modell eller «Manuell» for å skrive inn selv. Modell-inputfeltet beholdes og oppdateres automatisk, men er fortsatt redigerbart

### Teknisk detalj

Gjenbruker samme `DroneModel`-interface og `handleModelSelect`-logikk som allerede finnes i `AddDroneDialog.tsx`. Ingen databaseendringer nødvendig — `drone_models`-tabellen eksisterer allerede.

