

## Forbedring: Vis ventende logger ved lukking under prosessering

### Endringer i `src/components/UploadDroneLogDialog.tsx`

**1. Vis melding under prosessering (bulk-result step):**
- Legg til en infomelding under progress-baren: «Du kan lukke dialogen, kom tilbake om litt for å se resultatene»

**2. Ved lukking under prosessering → gå til method-steget neste gang:**
- I `onOpenChange`-handleren: når dialogen lukkes mens `isBulkProcessing` er true, sett en ref/flag som husker at prosessering pågår
- Når dialogen åpnes igjen (eller prosessering fullføres): sett `step` til `'method'` der `PendingDjiLogsSection` er synlig, og kall `pendingLogsRef.current?.refresh()`

**3. Ved ferdig prosessering mens dialogen er lukket:**
- Vis toast med oppsummering: «X filer lagt til behandlingskø»
- Neste gang dialogen åpnes, vises method-steget med oppdatert liste over ventende logger

**4. «Lukk»-knappen i bulk-result (etter ferdig):**
- Endre oppførsel: i stedet for å lukke dialogen, gå til `step = 'method'` der PendingDjiLogsSection vises med de nye loggene
- Endre knappetekst til «Se ventende logger»

### Konkret
- Linje 1935-1944 (under progress): legg til info-tekst
- Linje 1757-1761 (onOpenChange): refresh pending logs ved gjenåpning
- Linje 1983-1987 (Lukk-knapp): endre til å navigere til method-steget

