## Problem

Når en oppdragstype (f.eks. «Inspeksjon») har et standard-dokument tilknyttet via selskapsinnstillinger (`company_mission_types.default_document_id`), legges dokumentet i dag bare ved på serversiden i `mission_documents` etter at oppdraget er **lagret**. I selve "Legg til oppdrag"-dialogen vises ingenting i Dokumenter-feltet når man velger oppdragstype, så brukeren tror tilknytningen ikke fungerer.

## Fiks – `src/components/dashboard/AddMissionDialog.tsx`

1. Legg til en `useEffect` som lytter på `formData.oppdragstype` (kun i create-modus — `if (!mission)`):
   - Slå opp `missionTypes.find(t => t.label === formData.oppdragstype)`.
   - Hvis `default_document_id` finnes og ikke allerede er i `selectedDocuments`, kall `setSelectedDocuments(prev => [...prev, defaultDocId])`.
   - Bruk en `useRef` til å huske forrige oppdragstype så vi bare reagerer på faktiske endringer (ikke initiell mount når feltet er tomt eller forhåndsutfylt).
2. Ingen auto-fjerning: hvis brukeren bytter oppdragstype igjen, lar vi tidligere dokumenter ligge så brukeren kan fjerne dem manuelt via eksisterende X-knapp.
3. Server-side auto-attach (linje 856–864) beholdes som sikkerhetsnett for tilfeller der `selectedDocuments` skulle mangle dokumentet ved create (idempotent dedupering finnes allerede via `!effectiveSelectedDocs.includes(defaultDocId)`).

## Resultat

Velger man oppdragstype «Inspeksjon», dukker det tilknyttede dokumentet umiddelbart opp som en chip i Dokumenter-feltet i create-dialogen, og det lagres som forventet når oppdraget opprettes.