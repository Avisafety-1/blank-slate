

## Plan: Undertryck feilmeldinger ved avbrutte spørringer

### Problem

Når brukeren navigerer vekk fra dashboardet (f.eks. til /kart), avbryter `AbortController` alle pågående Supabase-spørringer. Disse avbrutte spørringer kaster feil som fanges opp i `catch`-blokker som viser `toast.error()` — altså "Kunne ikke laste dokumenter", "Kunne ikke laste hendelser" osv. Dette er falske feilmeldinger, spørringene ble avbrutt med vilje.

### Løsning

I `catch`-blokkene til de berørte komponentene, sjekk om feilen skyldes en abort før toast vises. Aborterte fetch-kall kaster enten en `DOMException` med navn `AbortError`, eller Supabase returnerer en feil med melding som inneholder "aborted". Enkel sjekk:

```typescript
} catch (error: any) {
  if (error?.name === 'AbortError' || abortSignal?.aborted) return;
  console.error("Error fetching documents:", error);
  toast.error(t('dashboard.documents.couldNotLoad'));
}
```

### Filer som endres

| Fil | Endring |
|-----|---------|
| `src/components/dashboard/DocumentSection.tsx` | Legg til abort-sjekk i catch-blokk (linje ~163) |
| `src/components/dashboard/IncidentsSection.tsx` | Legg til abort-sjekk i catch-blokk (linje ~241) |
| `src/components/dashboard/MissionsSection.tsx` | Legg til abort-sjekk i catch-blokk (linje ~104) |

Ingen funksjonelle endringer — kun filtrering av feilmeldinger som skyldes bevisst avbrudd.

