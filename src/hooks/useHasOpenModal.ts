import { useSyncExternalStore } from "react";
import { hasOpenModal, subscribeModalOpen } from "@/lib/modalState";

/**
 * Reaktiv versjon av hasOpenModal() — oppdateres (med 400 ms debounce)
 * når en modal dialog åpnes eller lukkes.
 */
export function useHasOpenModal(): boolean {
  return useSyncExternalStore(subscribeModalOpen, hasOpenModal);
}
