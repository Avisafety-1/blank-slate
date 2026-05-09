/** Wait until selector exists in DOM (or timeout). */
export function waitForElement(selector: string, timeout = 2000): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLElement>(selector);
    if (existing) return resolve(existing);

    let resolved = false;
    const observer = new MutationObserver(() => {
      const el = document.querySelector<HTMLElement>(selector);
      if (el && !resolved) {
        resolved = true;
        observer.disconnect();
        resolve(el);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    window.setTimeout(() => {
      if (!resolved) {
        observer.disconnect();
        resolve(document.querySelector<HTMLElement>(selector));
      }
    }, timeout);
  });
}

/** Open the mobile hamburger menu by clicking it (only on small screens). */
export async function openMobileNavIfNeeded() {
  if (window.innerWidth >= 1024) return;
  const trigger = document.querySelector<HTMLElement>('[data-tour="mobile-nav-trigger"]');
  if (trigger && !document.querySelector('[role="menu"][data-state="open"]')) {
    trigger.click();
    // Wait briefly for menu to render
    await new Promise((r) => setTimeout(r, 200));
  }
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
