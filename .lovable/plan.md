

## Problem

`AISearchBar` er kun rendret i en `<div className="lg:hidden">` — altså vises den **bare på mobil** (under `lg` breakpoint / 1024px). På pad og PC forsvinner den helt.

## Løsning

Legg til `AISearchBar` i desktop-layouten (center column) — plassert mellom "Active flights" og "Missions" seksjonen, wrappet i en `hidden lg:block` div. Søkefeltet vil da vises på alle skjermstørrelser.

### Endring i `src/pages/Index.tsx`

Etter "Active flights - Desktop" blokken (linje ~563), legg til:

```tsx
{/* AI Search Bar - Desktop */}
<div className="hidden lg:block">
  <AISearchBar />
</div>
```

Dette plasserer søkefeltet i midtkolonnen på desktop, rett over oppdragslisten — konsistent med mobilplasseringen.

