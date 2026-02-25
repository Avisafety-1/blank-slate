

# Påvirkning på eksisterende bruk (mobil/pad/PC)

## Kort svar

**Nei, endringene vil ikke endre opplevelsen på mobil, nettbrett eller PC.** De er designet for å være bakoverkompatible. Her er vurderingen punkt for punkt:

---

## 1. Senke Vite build target (`es2015`, `chrome70`)

**Ingen synlig endring.** Vite transpilerer bare moderne JS-syntaks (som `??=`, `||=`) ned til eldre syntaks. Sluttresultatet er funksjonelt identisk — bare litt mer verbose JavaScript. Moderne nettlesere kjører det like raskt. Bundle-størrelsen kan øke marginalt (noen få KB), men dette er neglisjerbart.

## 2. Try/catch rundt `createSyncStoragePersister`

**Ingen endring i normal bruk.** localStorage fungerer på alle moderne nettlesere. Try/catch-blokken aktiveres bare hvis localStorage er utilgjengelig (f.eks. privat modus på svært gamle nettlesere). På mobil/pad/PC fortsetter alt som før.

## 3. Global error handler i `index.html`

**Ingen synlig endring.** Scriptet viser bare en feilmelding hvis appen feiler helt ved oppstart. På fungerende nettlesere (alle mobiler, nettbrett, PC-er i bruk i dag) vil scriptet aldri aktiveres — det er en ren "failsafe" for enheter der JS-bundlen krasjer.

## 4. CSS: `svh`/`dvh` → `screen` (`vh`)

**Minimal visuell endring.** `svh` (small viewport height) og `vh` (viewport height) er identiske i de fleste situasjoner. Forskjellen er kun synlig på iOS Safari der adresselinjen skjuler/viser seg — `svh` bruker den minste høyden, `vh` bruker den "statiske" høyden. Sidebar-komponenten brukes ikke i appen per nå (appen bruker Header-navigasjon), så endringen der er irrelevant. For `ExpandedMapDialog` har den allerede `sm:h-[90vh]` som fallback for desktop, og på mobil vil `h-screen` (`100vh`) oppføre seg nesten identisk med `100dvh`.

**index.css sin `dvh`-bruk er allerede bak `@supports`** og trenger ikke endres — den har `min-height: 100%` som fallback.

---

## Konklusjon

Alle fire endringene er "defensive" tiltak som kun aktiveres på eldre/begrensede nettlesere. For brukere på moderne mobil, nettbrett og PC vil appen fungere og se ut nøyaktig som i dag.

