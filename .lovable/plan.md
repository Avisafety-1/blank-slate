# Tensio-kartlaget vises ikke lenger

## Hva som skjedde (verifisert)

Kartlaget "Luftnett Tensio" vises kun når appen klarer å slå opp navnet på rot-selskapet i hierarkiet. Det oppslaget spør etter en kolonne som heter `name` i selskapstabellen — men kolonnen heter `navn`. Spørringen feiler derfor alltid, navnet blir tomt, og appen konkluderer med at brukeren ikke tilhører Tensio. Da bygges laget aldri, og det forsvinner også fra kartlag-menyen.

Verifisert i databasen: hierarkiet er intakt — "Tensio" (rot) med avdelingene "Tensio Nord" og "Tensio Sør" under seg. Ingen tilgangsregler eller data er endret; det er kun feltnavnet i oppslaget som er feil.

Samme oppslag brukes i admin-siden "Standard kartlag", så Tensio-laget mangler også der.

## Hva som skal gjøres

1. Rett oppslaget av rot-selskapets navn til å bruke `navn` (med `name` som reserveløsning, slik at det tåler begge).
2. Bekrefte i forhåndsvisningen at laget dukker opp igjen i kartlag-menyen under "Infrastruktur" og tegnes for Tensio-brukere, og at det fortsatt er usynlig for andre selskaper.

Ingen databaseendringer, ingen endringer i tilgangsregler.

## Teknisk

- `src/lib/companyHierarchy.ts`: `resolveRootCompanyName` velger `navn` i stedet for `name`; rydd også opp i at feil fra spørringen ikke caches som `null` slik at et forbigående nettverksfeil ikke skjuler laget permanent i økten.
- Berører indirekte `src/components/OpenAIPMap.tsx` (`isTensioHierarchy`) og `src/components/admin/MapLayerDefaultsSection.tsx` uten kodeendringer der.
