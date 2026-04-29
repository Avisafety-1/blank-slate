Plan: Legge til Tensio luftnett som eget kartlag kun for Tensio

Mål
- Legge til WMS-kartlaget fra Tensio som et nytt valg i kartlagsmenyen.
- Kartlaget skal bare vises for brukere i selskapet Tensio og avdelinger under Tensio.
- For Tensio-hierarkiet skal Tensio-kartlaget være standard på.
- For Tensio-hierarkiet skal NVE-kartlaget være standard av.
- For alle andre selskaper skal Tensio-kartlaget ikke være synlig i kartlagsmenyen, og NVE beholder dagens oppførsel.

Foreslått brukeropplevelse
- I kartlagspanelet vises et nytt valg, for eksempel:
  - «Luftnett Tensio»
- Dette valget vises kun når aktivt selskap er Tensio eller en avdeling/datterselskap under Tensio.
- Når en Tensio-bruker åpner kartet, er «Luftnett Tensio» allerede aktivert.
- «Kraftledninger (NVE)» forblir tilgjengelig, men står av som standard for Tensio.
- Andre kunder ser ikke Tensio-laget i det hele tatt.

Teknisk plan

1. Identifisere om aktivt selskap er Tensio eller under Tensio
- Utvide `AuthContext` med `parentCompanyId`, slik at kartkomponenten kan vite om brukeren tilhører et morselskap eller en avdeling.
- `AuthContext` henter allerede `companies.parent_company_id`, så dette krever bare at verdien lagres i context og cache.
- Legge til en helper i kartkomponenten som avgjør om aktivt selskap er i Tensio-hierarkiet.

Foreslått logikk:
```ts
const TENSIO_COMPANY_NAME = "tensio";

const isTensioCompany =
  companyName?.toLowerCase().includes("tensio") ||
  parentCompanyName?.toLowerCase().includes("tensio");
```

Bedre/mer robust variant:
- Hvis Tensio sin faktiske `company_id` er kjent eller kan slås opp én gang, bruk ID i stedet for navn.
- For produksjon anbefales ID-basert kontroll:
```ts
const isTensioHierarchy =
  companyId === TENSIO_COMPANY_ID || parentCompanyId === TENSIO_COMPANY_ID;
```

Hvis vi ikke kjenner Tensio-ID på forhånd, kan vi hente Tensio-selskapet via `companies` basert på navn og sammenligne mot `companyId`/`parentCompanyId`. Dette er fortsatt kun frontend-tilgang til et offentlig kartlag, ikke sensitiv data.

2. Legge inn Tensio WMS-laget i `OpenAIPMap`
- Opprette WMS-layer med Leaflet:
```ts
const tensioLuftnettLayer = L.tileLayer.wms(
  "https://tensio-prod-k8s10.cloudgis.no/arcgis/services/luftnett/luftnett/MapServer/WMSServer",
  {
    layers: "0,1,2,3,4,5,6,7,8,9",
    format: "image/png",
    transparent: true,
    opacity: 0.75,
    attribution: "Tensio luftnett",
    version: "1.3.0",
  }
);
```

- Kun legge laget inn i `layerConfigs` når `isTensioHierarchy === true`.
- Når `isTensioHierarchy === true`, legge laget direkte på kartet med `.addTo(map)` slik at det er default på.
- Bruke samme `zap`-ikon som NVE-laget, eller eventuelt et eget ikon hvis ønskelig.

3. Justere NVE default bare for Tensio
- Dagens NVE-lag er allerede default av.
- Jeg vil likevel gjøre logikken eksplisitt slik at Tensio-regelen ikke påvirker andre lag:
  - Tensio: «Luftnett Tensio» på, «Kraftledninger (NVE)» av.
  - Ikke-Tensio: «Luftnett Tensio» skjult, «Kraftledninger (NVE)» som i dag.

4. Sørge for riktig visuell prioritet i kartet
- Tensio WMS-laget bør få egen pane, f.eks. `tensioPowerPane`, med omtrent samme z-index som kraftlinjer.
- Siden WMS er et bildebasert lag, må pane/opacity settes slik at det ikke skjuler viktige lag som NOTAM, ruteplanlegging og popups.
- Anbefalt:
```ts
map.createPane("tensioPowerPane");
map.getPane("tensioPowerPane")!.style.zIndex = "699";
```
- Popups/tooltip-pane beholdes høyere, som i dag.

5. Kartlagsmeny og toggling
- Vanlig `handleLayerToggle` kan brukes for WMS-laget, siden det ikke trenger viewport-fetch slik NVE-laget gjør.
- Ingen ny database-tabell eller RLS-policy trengs for selve kartlaget, siden datakilden er en ekstern offentlig WMS.
- Tilgangsbegrensningen skjer i UI: laget tilbys bare til Tensio-hierarkiet.

6. Hensyn til ruteplanlegging
- I ruteplanlegging må laget ikke hindre klikk på kartet.
- Sette `pointerEvents = "none"` på Tensio-pane i `routePlanning`, tilsvarende eksisterende mønster for ikke-interaktive kartlag.
- WMS-laget har uansett ikke vanlige Leaflet-vektorobjekter, men pane-regelen gjør dette tryggere på mobil/iPad.

7. Testing
- Teste som Tensio-bruker/avdeling:
  - «Luftnett Tensio» vises i kartlagsmenyen.
  - Laget er på ved åpning av kartet.
  - NVE-laget er av ved åpning.
  - Man kan slå Tensio-laget av/på.
- Teste som ikke-Tensio:
  - «Luftnett Tensio» vises ikke.
  - NVE-laget fungerer som før.
- Teste på mobilbredde 360px:
  - Kartlagsmenyen får plass.
  - Kartinteraksjon fungerer i ruteplanlegging.

Filer som sannsynligvis endres
- `src/contexts/AuthContext.tsx`
  - legge til `parentCompanyId` og eventuelt `parentCompanyName` i auth context/cache.
- `src/components/OpenAIPMap.tsx`
  - legge til Tensio WMS-lag, condition for synlighet og default på.
  - justere pane/z-index og eventuell pointer-events-logikk.

Mulig alternativ uten AuthContext-endring
- Hente `parent_company_id` direkte i `OpenAIPMap` basert på `companyId`.
- Dette gir mindre endring i auth, men legger en ekstra Supabase-spørring i kartkomponenten.
- Jeg anbefaler AuthContext-varianten fordi `parent_company_id` allerede hentes der, og det kan gjenbrukes senere.