## Endringer i `FH2AirspaceWebhookSection.tsx`

1. **Skjul "FlightHub Organization ID"-feltet** (linje 204–207). Det utledes automatisk og skal ikke endres — ingen grunn til å vises. Logikken (`orgId` state + setting fra save-respons) beholdes internt, bare UI fjernes.

2. **Legg til info-tekst om dock-begrensning** rett under seksjonens beskrivelse (etter linje 149). Bruker en `Alert` med Info-ikon:

   > **Merk:** FlightHub 2 luftromsdeling fungerer kun for dock-droner og droner tilkoblet en DJI Dock. Håndholdte fjernkontroller støttes ikke.

Ingen backend-/datamodellendringer.