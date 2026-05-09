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

/** Radix DropdownMenuTrigger opens on pointerdown — synthetic click() doesn't always work. */
function fireRadixToggle(el: HTMLElement) {
  const opts = { bubbles: true, cancelable: true, composed: true, pointerType: "mouse", button: 0 } as PointerEventInit;
  try {
    el.dispatchEvent(new PointerEvent("pointerdown", opts));
    el.dispatchEvent(new PointerEvent("pointerup", opts));
  } catch {
    // PointerEvent may not be constructable in some browsers — fall back to mouse events
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0 }));
  }
  el.click();
}

/** Open the mobile hamburger menu by clicking it (only when the desktop nav is hidden). */
export async function openMobileNavIfNeeded() {
  const trigger = document.querySelector<HTMLElement>('[data-tour="mobile-nav-trigger"]');
  if (!trigger) return;
  const visible = trigger.offsetParent !== null;
  if (!visible) return;
  const isOpen = () => !!document.querySelector('[role="menu"][data-state="open"]');
  if (isOpen()) return;
  fireRadixToggle(trigger);
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 25));
    if (isOpen()) return;
  }
  // Last-resort retry
  fireRadixToggle(trigger);
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 25));
    if (isOpen()) return;
  }
}

/** Close the mobile hamburger menu if open. */
export async function closeMobileNav() {
  const trigger = document.querySelector<HTMLElement>('[data-tour="mobile-nav-trigger"]');
  const open = document.querySelector('[role="menu"][data-state="open"]');
  if (trigger && open) {
    fireRadixToggle(trigger);
    await new Promise((r) => setTimeout(r, 150));
  }
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
