/** Returns true if the element is laid out (visible) — display:none / hidden parents → false. */
function isVisible(el: HTMLElement | null): boolean {
  if (!el) return false;
  if (el.offsetParent === null && getComputedStyle(el).position !== "fixed") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/** Find the first VISIBLE element matching selector, or any match if none visible. */
function findVisible(selector: string): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(selector));
  return all.find(isVisible) || all[0] || null;
}

/** Wait until a visible selector match exists in DOM (or timeout). */
export function waitForElement(selector: string, timeout = 2000): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const existing = findVisible(selector);
    if (existing && isVisible(existing)) return resolve(existing);

    let resolved = false;
    const observer = new MutationObserver(() => {
      const el = findVisible(selector);
      if (el && isVisible(el) && !resolved) {
        resolved = true;
        observer.disconnect();
        resolve(el);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });

    window.setTimeout(() => {
      if (!resolved) {
        observer.disconnect();
        resolve(findVisible(selector));
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

/** Close the mobile hamburger menu if open. Works even when the trigger is hidden
 *  on the current breakpoint (e.g. menu left open after a viewport change). */
export async function closeMobileNav() {
  const open = document.querySelector<HTMLElement>('[role="menu"][data-state="open"]');
  if (!open) return;
  // Try clicking the trigger first (only works if trigger is actionable)
  const trigger = document.querySelector<HTMLElement>('[data-tour="mobile-nav-trigger"]');
  if (trigger && trigger.offsetParent !== null) {
    fireRadixToggle(trigger);
  }
  // Always also dispatch Escape to handle hidden-trigger / stale-open cases
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  open.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 200));
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
