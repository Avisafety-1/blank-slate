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

/** Open the mobile hamburger menu by clicking it (only when the desktop nav is hidden). */
export async function openMobileNavIfNeeded() {
  // The desktop nav is hidden below lg (1024px). Use the actual visibility of
  // the trigger to decide rather than just window width — covers tablets too.
  const trigger = document.querySelector<HTMLElement>('[data-tour="mobile-nav-trigger"]');
  if (!trigger) return;
  const visible = trigger.offsetParent !== null;
  if (!visible) return;
  const isOpen = () => !!document.querySelector('[role="menu"][data-state="open"]');
  if (!isOpen()) {
    trigger.click();
    // Wait for Radix to mount the menu
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 25));
      if (isOpen()) break;
    }
  }
}

/** Close the mobile hamburger menu if open. */
export async function closeMobileNav() {
  const trigger = document.querySelector<HTMLElement>('[data-tour="mobile-nav-trigger"]');
  const open = document.querySelector('[role="menu"][data-state="open"]');
  if (trigger && open) {
    trigger.click();
    await new Promise((r) => setTimeout(r, 150));
  }
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
