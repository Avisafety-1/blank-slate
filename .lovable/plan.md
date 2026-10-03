# Fiks frys og skjulte knapper i Safari på iPhone/iPad (webapp)

Ingen databaseendringer. Ingen lokal utkastlagring (egen sak senere).

## Rotårsak (bekreftet i koden)
- `ForceReloadBanner` ligger `fixed top-0 z-[9999]` over Radix-dialoger (z-[1200]) og dekker dialogens lukkeknapp. Radix setter `pointer-events:none` på body mens en modal er åpen, så banneret kan heller ikke trykkes → brukeren låses.
- Tvungen oppdatering (`forceImmediate`) kaller `performReload()` direkte, også mens et skjema er åpent. `performReload()` sletter `avisafe_*`-nøkler og React Query-cachen → ulagrede endringer går tapt.
- Admin tvinger oppdateringer sent på kveld. iOS kobler fra Supabase realtime i dvale, så broadcasten går tapt; oppdateringen oppdages først neste morgen, ofte med «Rediger oppdrag» fortsatt åpent.
- `AddMissionDialog` bruker kun `max-h-[90vh]`; i iOS Safari er `vh` = største viewport, så bunnen (Lagre) havner bak verktøylinja eller tastaturet.

## Endringer

### 1) Ny fil `src/lib/modalState.ts`
- `hasOpenModal(): boolean` — true hvis `[role="dialog"][data-state="open"][aria-modal="true"]` eller `[role="alertdialog"][data-state="open"]` finnes. Popover-innhold (role="dialog" uten aria-modal) teller IKKE. Inkluder åpne vaul-drawere hvis `drawer.tsx` brukes (sjekk attributter).
- `clearStaleBodyLock(): void` — for `documentElement` og `body`: fjern inline `pointer-events`, `overflow:hidden`, `position:fixed`, og attributtet `data-scroll-locked`.
- `onLastModalClosed(cb): () => void` — MutationObserver på `document.body` (attributes + childList + subtree, attributeFilter `['data-state','style','data-scroll-locked']`). Når `hasOpenModal()` går true→false: vent 400 ms, sjekk på nytt, kall `cb` kun hvis fortsatt ingen modal. Returner frakoblingsfunksjon.
- `GuidedTourProvider.tsx` (~linje 108–118) bytter til `clearStaleBodyLock()` slik at logikken bare finnes ett sted.

### 2) `src/hooks/useForceReload.ts`
- Én funksjon `requestReload(force: boolean)`. BÅDE broadcast-veien og `handleOnline`-veien (inkl. `app_version_force_immediate`) kaller denne i stedet for `performReload()`/direkte `globalState`.
- `force = true`:
  - `document.visibilityState === 'hidden'` → marker pending, ingen reload nå.
  - Ingen åpen modal → `performReload()` straks.
  - Åpen modal → `globalState = { showBanner: true, forceImmediate: true }`; `notify()`. Når siste modal lukkes (`onLastModalClosed`) → `performReload()`. INGEN tidsgrense.
- `force = false`:
  - Åpen modal → marker pending; vis banneret når siste modal lukkes.
  - Ellers → `globalState = { showBanner: true, forceImmediate: false }`; `notify()`.
- Kjør versjonssjekken (`handleOnline`) også ved `visibilitychange → 'visible'` og `pageshow` (iOS bfcache), throttlet til maks én gang per 60 s. Hovedvei for kveldsoppdateringer når broadcast er tapt.
- Ved `visibilitychange → 'visible'` med pending reload: samme regler som over.
- Rydd opp alle lyttere/observere i cleanup.

### 3) `src/components/ForceReloadBanner.tsx`
- Plassering: `fixed bottom-0 left-0 right-0 z-[9999] pointer-events-auto`, `paddingBottom: calc(env(safe-area-inset-bottom, 0px) + 0.75rem)`. Fjern top-padding.
- Vanlig variant: «Ny versjon tilgjengelig», knappene «Oppdater nå» og «Senere», lenke «Se endringslogg». «Senere» skjuler banneret; vis igjen ved neste `visibilitychange → visible`, tidligst 30 min etter trykk.
- Tvungen variant: «Ny versjon må installeres – lagre og lukk vinduet for å oppdatere». Ingen «Senere», ingen endringslogg-lenke. Behold «Oppdater nå».
- Skjul «Se endringslogg» mens `hasOpenModal()` er true.
- Alle tekster via `t()`-nøkler i no.json og en.json: `forceReload.available`, `forceReload.required`, `forceReload.updateNow`, `forceReload.updating`, `forceReload.later`, `forceReload.changelog`.

### 4) Ny hook `src/hooks/useBodyLockRecovery.ts` (monteres i App.tsx ved `useForceReload()`)
- `onLastModalClosed(() => clearStaleBodyLock())`.
- Ved `visibilitychange → 'visible'` og `pageshow`: hvis `!hasOpenModal()`, kall `clearStaleBodyLock()`.
- Ufarlig på DJI-kontrollere (dialoger ikke-modale der); opprydding skjer kun når ingen modal er åpen.

### 5) Synlig høyde (tastatur og Safari-verktøylinje)
- Ny hook `src/hooks/useVisualViewportVar.ts`, montert én gang i App.tsx: sett CSS-variabelen `--vvh` på `<html>` til `${visualViewport.height}px` (fallback `window.innerHeight`), oppdater på visualViewport `resize`/`scroll` og window `resize`, throttlet med `requestAnimationFrame`.
- `src/components/ui/dialog.tsx`, `DialogContent`: legg KUN til `max-h-[90vh] max-h-[90dvh]` først i `cn()`, slik at `className` fra hver dialog fortsatt overstyrer (tailwind-merge). Ingen overflow/padding/logikk her.

### 6) `src/components/dashboard/AddMissionDialog.tsx`
- `DialogContent`: `w-[95vw] max-w-2xl p-0 gap-0 flex flex-col overflow-hidden max-h-[90vh] max-h-[90dvh]` + `style={{ maxHeight: 'calc(var(--vvh, 90vh) * 0.92)' }}`.
- Fast header (ikke rullende): `DialogTitle` med padding som gir plass til lukkeknappen (X).
- Rullende midtdel: `flex-1 min-h-0 overflow-y-auto [touch-action:pan-y] [-webkit-overflow-scrolling:touch] px-4 sm:px-6`.
- Fast footer (ikke rullende) med «Avbryt»/«Lagre», `border-t bg-background`, `paddingBottom: calc(env(safe-area-inset-bottom, 0px) + 0.75rem)`.
- Lagre-knappen sender fortsatt skjemaet: `<form id="mission-form">` og `form="mission-form"` på knappen hvis den flyttes ut av `<form>`. Eksisterende validering og `handleSubmit` uendret.
- Ved fokus på input/textarea i midtdelen: etter 300 ms, `el.scrollIntoView({ block: 'nearest' })`.

## IKKE ENDRE
- DJI-logikken i `dialog.tsx` (`djiNonModal`, `onPointerDownOutside`/`onInteractOutside`).
- Flylogg-dialogen (`.dji-log-split`) — bevisst `overflow-hidden` og top/bottom-%.
- Regelen: aldri `dvh` uten `vh`-fallback foran; scrollområder har `[touch-action:pan-y]`.
- Innholdet i `performReload()` og `clearAllCaches()`.

## Validering
- Typesjekk uten feil (`npx tsgo --noEmit -p tsconfig.app.json && git diff --check`).
- Forhåndsvisning iPhone (390x844) og iPad (820x1180):
  a) «Rediger oppdrag» åpen + `requestReload(false)` → ikke banner før dialogen lukkes; deretter banner nederst, alle knapper virker.
  b) «Rediger oppdrag» åpen + `requestReload(true)` → tvungent banner nederst, X og Lagre virker; reload først når dialogen lukkes.
  c) Uten åpen dialog + `requestReload(true)` → reload straks.
  d) Fokus på felt nederst i skjemaet → feltet og Lagre synlige.
  e) Etter lukket dialog: body uten `pointer-events:none` og `data-scroll-locked`.
- Oppsummer endrede filer til slutt.
