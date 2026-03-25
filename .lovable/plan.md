

## Solstormvurdering (Kp-indeks) i SORA

### Hva bygges
Edge function `ai-risk-assessment` henter geomagnetisk Kp-indeks fra NOAA SWPC og inkluderer det i AI-konteksten. Ved lav aktivitet (Kp < 5) gis kun én kort setning. Ved høy aktivitet (Kp ≥ 5) gis advarsel om GPS/GNSS-påvirkning.

### Datakilde
- `https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json`
- Gratis, offentlig, ingen API-nøkkel, JSON-format
- Returnerer 3-dagers Kp-prognose i 3-timers intervaller

### Teknisk endring — kun `supabase/functions/ai-risk-assessment/index.ts`

**1. Ny fetch (~etter linje 367, etter vær-henting):**
- Hent Kp-forecast fra NOAA
- Finn høyeste Kp-verdi for oppdragets dato
- Bestem NOAA G-skala (G1=Kp5, G2=Kp6, G3=Kp7+)
- Wrap i try/catch — feil skal ikke blokkere resten

**2. Legg til i `contextData` (~linje 818):**
```typescript
solarActivity: { kpIndex, noaaScale, level }
```

**3. Oppdater systemprompten (~linje 930-området):**
Ny seksjon rett før `### RESPONS-FORMAT`:

```
### SOLSTORM / GEOMAGNETISK AKTIVITET
Hvis Kp < 5: Skriv KUN én kort setning, f.eks. "Geomagnetisk aktivitet vurdert — Kp X, ingen forstyrrelse forventet."
Hvis Kp 5-6 (G1-G2): Advarsel om mulig GPS/GNSS-degradering. Reduser equipment score med 1.
Hvis Kp 7+ (G3+): Sterk advarsel. Reduser equipment score med 2-3. Vurder caution/no-go.
```

### Omfang
- Ingen database-endringer
- Ingen frontend-endringer
- Ingen nye filer
- Kun edge function-oppdatering

