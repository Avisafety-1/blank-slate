## Problem

Når et oppdrag har en lokasjon som er en lang sammenhengende streng (f.eks. en `https://maps.app.goo.gl/...`-lenke uten mellomrom), strekker `MissionDetailDialog` seg ut bredere enn mobilskjermen. Dette skjer fordi:

- Lokasjons-`<p>` ligger i en flex-container (`flex items-start gap-3`) der det indre `<div>`-et mangler `min-w-0`. Som default blir `min-width` på flex-barn `auto`, så barnet kan ikke krympe under innholdets intrinsiske bredde.
- Teksten har ingen ord-bryting, så en lang URL behandles som ett "ord" som tvinger bredden.

## Løsning

I `src/components/dashboard/MissionDetailDialog.tsx`, rundt linje 265–271:

1. Legg til `min-w-0 flex-1` på det indre `<div>`-et som inneholder Lokasjon-tittelen og verdien, slik at det kan krympe i flex-containeren.
2. Legg til `break-all` (eller `break-words`) på `<p>` med `currentMission.lokasjon`, slik at lange URL-er brytes innenfor tilgjengelig bredde.

Resultat: kortet holder seg innenfor mobilbredden, og lange lenker brytes pent over flere linjer.

### Teknisk endring (kort)

```tsx
<div className="flex items-start gap-3">
  <MapPin className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
  <div className="min-w-0 flex-1">
    <p className="text-sm font-medium text-muted-foreground">Lokasjon</p>
    <p className="text-base break-all">{currentMission.lokasjon}</p>
  </div>
</div>
```

`shrink-0` på ikonet sikrer at ikonet ikke blir presset sammen.

## Omfang

- Kun én fil endres: `src/components/dashboard/MissionDetailDialog.tsx`.
- Ingen logikk-endring, kun layout-klasser.
