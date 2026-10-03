/**
 * Felles verktøy for å vite om en modal dialog er åpen, og for å rydde
 * bort "fastlåst side"-tilstand som Safari på iOS/iPadOS av og til
 * etterlater når en dialog lukkes.
 *
 * Merk: Radix Dialog (v1.1.x) setter aldri aria-modal, så det kan ikke
 * brukes i selektoren. Popover/Select-innhold har role="dialog" men ligger
 * inne i [data-radix-popper-content-wrapper] og skal ikke telle.
 * Vaul-drawer og Sheet bygger på Radix Dialog og fanges av samme sjekk.
 */

export function hasOpenModal(): boolean {
  const nodes = document.querySelectorAll(
    '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'
  );
  for (let i = 0; i < nodes.length; i++) {
    if (!nodes[i].closest('[data-radix-popper-content-wrapper]')) return true;
  }
  return false;
}

/**
 * Fjerner rester av scroll-/peker-lås på html/body. Ufarlig å kalle når
 * ingen modal er åpen.
 */
export function clearStaleBodyLock(): void {
  try {
    for (const root of [document.documentElement, document.body]) {
      if (root.style.pointerEvents) root.style.pointerEvents = "";
      if (root.style.overflow === "hidden") root.style.overflow = "";
      if (root.style.position === "fixed") root.style.position = "";
      root.removeAttribute("data-scroll-locked");
    }
  } catch {
    // Ignorer — opprydding er best-effort.
  }
}

/**
 * Lett observer-oppsett. Kartene muterer style-attributter kontinuerlig,
 * derfor:
 *  - Observer A: childList på body (uten subtree) — portaler legges direkte på body.
 *  - Observer B: attributes med subtree, KUN data-state (aldri 'style').
 * Callback gjør ingen DOM-spørring direkte; én sjekk planlegges med
 * setTimeout(400) og nullstilles ved nye mutasjoner.
 */
function observeModalChanges(onSchedule: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      onSchedule();
    }, 400);
  };

  const observerA = new MutationObserver(schedule);
  observerA.observe(document.body, { childList: true });

  const observerB = new MutationObserver(schedule);
  observerB.observe(document.body, {
    attributes: true,
    subtree: true,
    attributeFilter: ["data-state"],
  });

  return () => {
    if (timer) clearTimeout(timer);
    observerA.disconnect();
    observerB.disconnect();
  };
}

/**
 * Kaller cb når siste modal lukkes (og det fortsatt ikke er noen modal
 * etter 400 ms). Returner en funksjon som kobler fra observerne.
 */
export function onLastModalClosed(cb: () => void): () => void {
  return observeModalChanges(() => {
    if (!hasOpenModal()) cb();
  });
}

/**
 * Varsler om endringer i om en modal er åpen. Bruker samme lette
 * observere og 400 ms debounce som onLastModalClosed.
 */
export function subscribeModalOpen(cb: (open: boolean) => void): () => void {
  let last = hasOpenModal();
  return observeModalChanges(() => {
    const now = hasOpenModal();
    if (now !== last) {
      last = now;
      cb(now);
    }
  });
}
