# Fix iPhone safe area overlap in meldingsdialog

Problem: På iPhone ligger headeren i meldings-Sheet'en for høyt oppe, slik at lukk-krysset (X) overlapper iOS status-linjen (klokke, 5G, batteri). Dette gjør knappen vanskelig å treffe og ser visuelt rotete ut.

Årsak: `SheetContent` i `src/components/profile/InboxTab.tsx` bruker `fixed inset-y-0 right-0` fra shadcn-variabten, men overstyringen `p-0` fjerner all padding – inkludert topp-padding som skulle sørge for `env(safe-area-inset-top)`. Lukk-knappen plasseres absolutt på `top-4`, altså rett under skjermkanten, inne i den uhensiktsmessige notch-/status-sonen.

Endring:
- Legge til topp-safe-area-padding på `SheetContent` i `InboxTab.tsx` (f.eks. `pt-[env(safe-area-inset-top)]` eller inline `style`).
- Sikre at `SheetHeader` og den absolutte lukk-knappen plasseres under denne sonen, slik at X-knappen får luft fra status-linjen.
- Beholde nåværende layout ellers: thread-list scrollbart, reply-composer fast nederst, dialog-bredde på `sm:max-w-md`.

Verifisering: Sjekke mobil-preview at headeren starter under status-linjen og at krysset er klikkbart.
