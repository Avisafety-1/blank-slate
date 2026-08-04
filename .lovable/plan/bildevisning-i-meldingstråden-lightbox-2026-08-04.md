# Bildevisning i meldingstråden (lightbox)

## Problem
Bilder i innboksen ligger i en `<a target="_blank">`. På iPad/Safari bytter dette fane, og når man
går tilbake er meldingsdialogen lukket fordi appen er lastet på nytt.

## Løsning
Bytt til en intern bildeviser (lightbox) som åpnes oppå meldingstråden, uten navigasjon.

- Klikk på et bilde åpner en overlay-visning i samme dialog — ingen ny fane, meldingsdialogen
  forblir åpen bak.
- Viseren viser bildet i full størrelse (tilpasset skjerm) med filnavn i toppen.
- Er det flere bilder i tråden, kan man bla mellom dem med pil venstre/høyre-knapper,
  tastaturpiler og sveip på touch. Teller viser «2 / 5».
- Lukkes med X, Escape eller klikk utenfor bildet.
- Nedlastingsknapp i viseren for det aktive bildet (bruker eksisterende `downloadAttachment`).
- Ikke-bilder (PDF o.l.) beholder dagens oppførsel med nedlasting.

## Teknisk
- Ny komponent `src/components/profile/AttachmentLightbox.tsx` bygget på eksisterende
  `Dialog`-primitiv, med `z-index` over meldingsdialogen.
- `src/components/profile/InboxTab.tsx`: erstatt `<a target="_blank">` rundt bildet med en knapp
  som setter `lightboxIndex`. Bildelisten for tråden utledes fra `attachments` filtrert på
  `mime_type?.startsWith("image/")`, slik at blaing dekker hele tråden (ikke bare én melding).
- Nye i18n-nøkler (`inbox.attachments.preview*`, next/prev/close/download) i både `no.json` og
  `en.json`.
- Ingen databaseendringer.
