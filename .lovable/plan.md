

# Oppdater resultat-dialogen med nye felter

Dialogen viser allerede mye, men mangler visning av flere felter som nå hentes fra edge-funksjonen etter siste utvidelse. Her er hva som mangler i UI-et:

## Felter som hentes men IKKE vises

| Felt | Beskrivelse | Prioritet |
|---|---|---|
| `rthTriggered` | RTH utløst under flyging | Høy — viktig sikkerhetsinformasjon |
| `maxGpsSatellites` | Maks GPS-satellitter | Medium — nyttig kontekst til min-verdien |
| `batteryTempMin` | Min. batteritemperatur | Medium — kulde er like farlig som varme |
| `batteryCellDeviationMax` | Maks celleavvik (V) | Høy — indikerer ubalansert batteri |
| `batteryStatus` | Statusstreng fra DJI | Lav — ofte kryptisk |
| `sha256Hash` | Dedupliserings-hash | Ikke vis — intern bruk |
| `events` | RTH, advarsler, lav-spenning | Høy — bør vises som hendelseliste |
| `endTimeUtc` | Sluttid for flygingen | Lav — kan vises i header |

## Plan

### 1. Vis RTH-varsel (ny boks)
Hvis `result.rthTriggered === true`, vis en rød/oransje advarselsboks lignende warnings-seksjonen: "Return to Home ble utløst under denne flygingen".

### 2. Utvid GPS-kortet
Endre "Min. GPS sat." til å vise **begge verdier**: `{min} – {max}` i stedet for bare min. Beholder rød farge hvis min < 6.

### 3. Legg til batteritemperatur-range
Vis `{min}°C – {max}°C` i stedet for bare maks-temp. Rød farge hvis max > 50 eller min < 5.

### 4. Legg til celleavvik-kort
Nytt KPI-kort for `batteryCellDeviationMax` med ikon og rød farge over 0.1V (indikerer dårlig balanse).

### 5. Vis flight events
Under warnings-seksjonen, vis `result.events` som en kompakt liste med ikon per type (RTH, APP_WARNING, LOW_BATTERY). Viser type + melding. Skjules hvis listen er tom.

### 6. Vis sluttid i header
Legg til formatert sluttid etter starttid: "05.05.2023 11:36 → 11:52".

---

## Tekniske detaljer

Kun **én fil** endres: `src/components/UploadDroneLogDialog.tsx`

### RTH-varsel (etter linje 843, før warnings)
```tsx
{result.rthTriggered && (
  <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
    <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5" />
    <p className="text-sm font-medium text-red-800 dark:text-red-300">
      Return to Home (RTH) ble utløst under denne flygingen
    </p>
  </div>
)}
```

### GPS-kort endring (linje 792-797)
Fra: `{result.minGpsSatellites}`
Til: `{result.minGpsSatellites}{result.maxGpsSatellites != null ? ` – ${result.maxGpsSatellites}` : ''}`

### Batt. temp endring (linje 798-803)
Fra: `{result.batteryTemperature}°C`
Til: `{result.batteryTempMin != null ? `${result.batteryTempMin} – ` : ''}{result.batteryTemperature}°C`

### Nytt celleavvik-kort (etter linje 842)
```tsx
{result.batteryCellDeviationMax != null && (
  <div className="p-2 rounded-lg bg-muted/30 space-y-0.5">
    <div className="flex items-center gap-1 text-xs text-muted-foreground"><Zap />Celleavvik</div>
    <p className={`text-sm font-medium ${result.batteryCellDeviationMax > 0.1 ? 'text-destructive' : ''}`}>
      {result.batteryCellDeviationMax.toFixed(3)} V
    </p>
  </div>
)}
```

### Events-seksjon (etter warnings, før matchedLog)
Kompakt liste over `result.events` filtrert til unike meldinger, med ikon basert på type.

### Sluttid i header (linje 740-741)
Legg til `result.endTimeUtc` formatert etter starttid med `→` separator.

