## Problem

AI Risikovurdering konkluderte at en C2-merket DJI Matrice 4TD kan opereres i A1 ("Nye regelverk tillater også C2-droner i A1 hvis det ikke er over folkemengder"). Det er feil. Per EU-regelverket og vedlagt tabell:

- **A1**: kun C0 (eller umerket <250 g) og C1
- **A2**: C2 (min. 30 m fra utenforstående, 5 m i lavhastighetsmodus)
- **A3**: C3 / C4 (eller umerket <25 kg), 150 m fra bolig/nærings/industri/rekreasjon

C2 hører **aldri** hjemme i A1.

## Endringer

Fil: `supabase/functions/ai-risk-assessment/prompts.ts`

### 1. Skjerpe underkategori-tabellen (norsk, ~linje 412–417 og engelsk ~linje 958–963)

Erstatt dagens kompakte tabell med en eksplisitt mapping som matcher Luftfartstilsynets droneplakat, og legg til en hardregel rett etter tabellen:

```
| Underkategori | Tillatte C-merkinger | Umerket tillatt | Vekt | Avstand fra utenforstående |
| A1 | C0, C1 | <250 g (maks 19 m/s) | C0: <250 g · C1: <900 g | Unngå overflyging; aldri over folkemengder |
| A2 | C2 | (ingen — kun C2) | C2: <4 kg | Min 30 m (5 m i lavhastighetsmodus 3 m/s); 1:1-regelen gjelder |
| A3 | C3, C4 | <25 kg | C3/C4: <25 kg | Min 150 m fra bolig-/nærings-/industri-/rekreasjonsområder; ingen utenforstående i området |
```

**HARDREGLER FOR C-MERKING → UNDERKATEGORI (må følges strengt):**
- En C2-merket drone kan IKKE opereres i A1. C2 hører til A2 (eller A3 hvis kravene til A2 ikke kan oppfylles).
- C0/C1 er de eneste klassemerkene som er tillatt i A1.
- C3/C4 er de eneste klassemerkene som er tillatt i A3 (eller umerket <25 kg).
- "Nye regelverk tillater C2 i A1" er FEIL og må aldri brukes som begrunnelse.
- Hvis dronen er C2-merket og operasjonen ikke kan oppfylle A2-avstandskravene (30 m / 5 m i lav hastighet), velg A3 — ikke A1.
- Underkategori utledes alltid fra C-merking først, deretter avstandskrav. Ikke "nedgrader" en C2 til A1 fordi befolkningstettheten er lav.

### 2. Speile samme oppdatering i engelsk seksjon
Samme tabell og samme hardregler oversatt til engelsk i den engelske prompt-blokken.

### 3. Påvirkning
- Kun prompt-tekst endres. Ingen kodelogikk, ingen schema-endringer, ingen DB-migreringer.
- Resultat: AI vil for en C2-merket M4TD korrekt foreslå A2 (med 30/5 m-krav) eller A3 (150 m), aldri A1.
