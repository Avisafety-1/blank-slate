

# Fix: Polyfill kjører for sent — må flyttes til `index.html`

## Problemet

Polyfillen i `src/main.tsx` fungerer **ikke** fordi ES-moduler hoister `import`-statements. Selv om polyfillen står øverst i filen, kjører denne rekkefølgen:

1. `import App from "./App.tsx"` evalueres (og alle transitive importer, inkludert `OpenAIPMap.tsx`)
2. `crypto.randomUUID()` kalles under modul-evaluering → **krasj**
3. Polyfillen kjører — men for sent

## Løsning

Flytt polyfillen til `index.html` som et vanlig `<script>`-blokk **før** `<script type="module">`. Vanlige scripts kjører synkront før moduler lastes. Det eksisterende error-handler-scriptet i `index.html` er det perfekte stedet å legge den.

## Filer som endres

| Fil | Endring |
|---|---|
| `index.html` | Legg til `crypto.randomUUID`-polyfill i det eksisterende `<script>`-blokken, før `showFallback`-funksjonen |
| `src/main.tsx` | Fjern polyfillen (den er nå i `index.html`) |

## Teknisk detalj

```text
index.html load order:
  1. <script> (synkront) → polyfill settes her ✓
  2. <script type="module" src="main.tsx"> → App importeres, crypto.randomUUID finnes nå ✓
```

Ingen påvirkning på moderne nettlesere — polyfillen aktiveres kun hvis funksjonen mangler.

