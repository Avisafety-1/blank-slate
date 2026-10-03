import { useEffect } from "react";
import { clearStaleBodyLock, hasOpenModal, onLastModalClosed } from "@/lib/modalState";

/**
 * Sikkerhetsnett mot "fastlåst side" i Safari på iOS/iPadOS: når siste
 * modal lukkes, eller appen kommer tilbake fra bakgrunnen/bfcache,
 * fjernes eventuelle rester av scroll-/peker-lås på body/html.
 * Ufarlig på DJI-kontrollere (dialoger er ikke-modale der) — opprydding
 * skjer kun når ingen modal er åpen.
 */
export function useBodyLockRecovery(): void {
  useEffect(() => {
    const unsubscribe = onLastModalClosed(() => clearStaleBodyLock());

    const onVisible = () => {
      if (!hasOpenModal()) clearStaleBodyLock();
    };
    const onPageShow = () => {
      if (!hasOpenModal()) clearStaleBodyLock();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);
}
