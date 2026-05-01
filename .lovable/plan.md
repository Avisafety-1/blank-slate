## Endring

I `src/components/SoraSettingsPanel.tsx` viser dropdown-en i dag `{modell} — {serienummer}`. Det gir lite mening når flere droner har samme modell og bruker er vant til å identifisere fly på registreringsnummer.

### Hva som endres

1. **Hent `registration_number`** i fleet-spørringen (linje 130-135):
   ```ts
   .select("id, modell, serienummer, registration_number, vekt, klasse")
   ```
2. **Oppdater `Drone`-typen** i samme fil (linje 42-43) med `registration_number?: string | null`.
3. **Vis-logikk** — lag en liten helper:
   ```ts
   const droneLabel = (d) => {
     const id = d.registration_number?.trim() || d.serienummer?.trim();
     return id ? `${d.modell} — ${id}` : d.modell;
   };
   ```
4. **Bruk helperen tre steder** der `${modell} — ${serienummer}` finnes i dag (linje 171, 240, 264) — både i `<SelectItem>`-rendering og i `droneName` som lagres på SORA-settings (slik at navnet som senere vises på oppdraget også får reg.nr).

### Filer som endres

- `src/components/SoraSettingsPanel.tsx` (kun denne)

Ingen DB-migrasjoner — `registration_number` finnes allerede på `drones` (brukes f.eks. i `DroneListDialog.tsx`).
