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
    const update = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        const h = window.visualViewport?.height ?? window.innerHeight;
        document.documentElement.style.setProperty("--vvh", `${h}px`);
      });
    };

    update();

    const vv = window.visualViewport;
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
}
