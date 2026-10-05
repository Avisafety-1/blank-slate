import { useEffect } from "react";

/**
 * Setter CSS-variabelen --vvh på <html> til den faktisk synlige
 * viewport-høyden (visualViewport.height). På iOS Safari krymper denne
 * når verktøylinja eller tastaturet er synlig, slik at dialoger kan
 * tilpasses og knapper ikke havner utenfor skjermen.
 */
export function useVisualViewportVar(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let raf = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const update = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        const viewport = window.visualViewport;
        const h = viewport?.height ?? window.innerHeight;
        const top = viewport?.offsetTop ?? 0;
        document.documentElement.style.setProperty("--vvh", `${h}px`);
        document.documentElement.style.setProperty("--vvt", `${top}px`);
      });
    };

    const scheduleUpdate = (delay: number) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        update();
      }, delay);
      timers.add(timer);
    };

    const isEditable = (element: Element | null): boolean =>
      element?.matches("input, textarea, select, [contenteditable]") ?? false;

    const handleFocusOut = () => {
      const focusTimer = setTimeout(() => {
        timers.delete(focusTimer);
        if (isEditable(document.activeElement)) return;

        if ((window.visualViewport?.offsetTop ?? 0) > 0) {
          window.scrollTo(window.scrollX, window.scrollY);
        }

        update();
        scheduleUpdate(300);
        scheduleUpdate(600);
      }, 150);
      timers.add(focusTimer);
    };

    update();

    const vv = window.visualViewport;
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusout", handleFocusOut);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusout", handleFocusOut);
    };
  }, []);
}
