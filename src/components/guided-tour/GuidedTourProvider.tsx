import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import "./tour-styles.css";
import { getAllTours } from "@/tours/tourDefinitions";
import type { TourId, TourStep } from "@/tours/types";
import { waitForElement, sleep, closeMobileNav } from "@/tours/tourUtils";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";

const STORAGE_KEY = "avisafe.tours.completed";

export interface StartTourOptions {
  /** Kjøres bare når brukeren faktisk fullfører touren via «Fullfør»-knappen (ikke ved Hopp over / lukk) */
  onComplete?: () => void | Promise<void>;
}

interface GuidedTourContextValue {
  start: (tourId: TourId, opts?: StartTourOptions) => Promise<void>;
  isCompleted: (tourId: TourId) => boolean;
  resetAll: () => void;
  reset: (tourId: TourId) => void;
}

const Ctx = createContext<GuidedTourContextValue | null>(null);

function readCompleted(): TourId[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TourId[]) : [];
  } catch {
    return [];
  }
}
function writeCompleted(list: TourId[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(new Set(list)))); } catch {}
}

function setMapInteraction(active: boolean) {
  document.body.classList.toggle("avisafe-tour-map-interaction", active);
}

function setTourActive(active: boolean) {
  document.body.classList.toggle("avisafe-tour-active", active);
}

function setTourId(id: string | null) {
  if (id) document.body.setAttribute("data-tour-id", id);
  else document.body.removeAttribute("data-tour-id");
}

export const GuidedTourProvider = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, isSuperAdmin, hasTrainingModuleAccess } = useAuth();
  const { t } = useTranslation();
  const driverRef = useRef<Driver | null>(null);
  const [, force] = useState(0);

  const stepAllowed = useCallback((s: TourStep) => {
    if (s.requiresAdmin && !isAdmin) return false;
    if (s.requiresSuperAdmin && !isSuperAdmin) return false;
    if (s.requiresModule && !hasTrainingModuleAccess(s.requiresModule as any)) return false;
    return true;
  }, [isAdmin, isSuperAdmin, hasTrainingModuleAccess]);

  const start = useCallback(async (tourId: TourId, opts?: StartTourOptions) => {
    const tour = getAllTours(t)[tourId];
    if (!tour) return;

    const candidates = tour.steps.filter(stepAllowed);
    if (!candidates.length) return;

    const cleanupTourUi = () => {
      setMapInteraction(false);
      setTourActive(false);
      setTourId(null);
      void closeMobileNav();
      // Sikkerhetsnett: fjern eventuelle gjenværende driver.js-noder og klasser
      // som kan etterlate siden i "låst" tilstand.
      try {
        // Fjern alle driver.js-noder (overlay, stage, popover, page-overlay,
        // høydepunkt-wrapper m.m.) — bruk bred matcher.
        document.querySelectorAll<HTMLElement>(
          '[class*="driver-"], #driver-page-overlay, #driver-popover-item, .driver-overlay, .driver-popover, .driver-stage'
        ).forEach((n) => {
          // Klasse-rester på "ekte" innholdselementer skal kun ryddes — ikke fjernes.
          const isOwnNode =
            n.classList.contains("driver-overlay") ||
            n.classList.contains("driver-popover") ||
            n.classList.contains("driver-stage") ||
            n.id === "driver-page-overlay" ||
            n.id === "driver-popover-item";
          if (isOwnNode) {
            n.remove();
          } else {
            n.classList.remove(
              "driver-active-element",
              "driver-highlighted-element",
              "driver-fade",
              "driver-active"
            );
          }
        });
      } catch {}
      // Fjern globale klasser/attributter som driver.js setter på html/body.
      for (const root of [document.documentElement, document.body]) {
        root.classList.remove("driver-active", "driver-fade", "driver-active-element", "driver-highlighted-element");
        // Nullstill inline-stiler driver.js kan ha satt.
        if (root.style.pointerEvents) root.style.pointerEvents = "";
        if (root.style.overflow === "hidden") root.style.overflow = "";
        if (root.style.position === "fixed") root.style.position = "";
        // Fjern eventuelle data-driver-* attributter.
        Array.from(root.attributes)
          .filter((a) => a.name.startsWith("data-driver"))
          .forEach((a) => root.removeAttribute(a.name));
      }
    };

    // Destroy any previous tour cleanly first.
    try { driverRef.current?.destroy(); } catch {}
    cleanupTourUi();

    let finishing = false;
    const finish = (markComplete: boolean, fullyCompleted: boolean = false) => {
      if (finishing) return;
      finishing = true;
      try { d.destroy(); } catch {}
      driverRef.current = null;
      cleanupTourUi();
      // Driver.js kjører noe opprydding asynkront — kjør flere passeringer
      // så vi sikkert fanger overlay/klasser som dukker opp etter destroy.
      requestAnimationFrame(cleanupTourUi);
      setTimeout(cleanupTourUi, 100);
      setTimeout(cleanupTourUi, 300);
      if (markComplete) {
        const completed = readCompleted();
        if (!completed.includes(tourId)) writeCompleted([...completed, tourId]);
      }
      if (fullyCompleted && opts?.onComplete) {
        try { void opts.onComplete(); } catch (e) { console.error("Tour onComplete error", e); }
      }
      force((x) => x + 1);
    };

    const d: Driver = driver({
      allowClose: true,
      allowKeyboardControl: false,
      overlayClickBehavior: (() => {}) as any,
      overlayOpacity: 0.55,
      stagePadding: 6,
      stageRadius: 8,
      smoothScroll: true,
      animate: true,
      popoverClass: "avisafe-tour",
      onPopoverRender: (popover) => {
        // Inject a "Hopp over" button next to close
        if (popover.footerButtons && !popover.footerButtons.querySelector(".avisafe-skip-btn")) {
          const skip = document.createElement("button");
          skip.className = "avisafe-skip-btn";
          skip.textContent = t("tours.ui.skip");
          skip.onclick = () => finish(true);
          popover.footerButtons.prepend(skip);
        }
      },
      onDestroyStarted: (_element, _step, { driver }) => {
        // ESC / overlay-klikk / X — sørg for å rydde og avslutte helt
        try { driver.destroy(); } catch {}
        finish(true);
      },
      onDestroyed: cleanupTourUi,
    });


    driverRef.current = d;
    setTourActive(true);
    setTourId(tourId);

    const performStep = async (index: number) => {
      const step = candidates[index];
      if (!step) {
        finish(true, true);
        return;
      }

      // Navigate first if needed
      if (step.route && location.pathname !== step.route) {
        navigate(step.route);
        await sleep(300);
      }

      // beforeStep hook (open/close menus, scroll widgets into view, etc.)
      try { await step.beforeStep?.(); } catch {}

      // Wait for visible element
      const el = await waitForElement(step.selector, step.optional === false ? 4000 : 1500);
      if (!el) {
        return performStep(index + 1);
      }

      setMapInteraction(Boolean(step.allowMapInteraction));

      const isLast = index === candidates.length - 1;
      const isFirst = index === 0;
      const progress = t("tours.ui.step", { current: index + 1, total: candidates.length });

      d.highlight({
        element: el,
        popover: {
          title: step.title,
          description: `<div class="avisafe-tour-progress">${progress}</div>${step.description}`,
          side: (step.side === "over" ? undefined : step.side) ?? "bottom",
          align: "start",
          popoverClass: "avisafe-tour",
          showButtons: ["next", "previous", "close"],
          disableButtons: isFirst ? ["previous"] : [],
          nextBtnText: isLast ? t("tours.ui.finish") : t("tours.ui.next"),
          prevBtnText: t("tours.ui.prev"),
          onNextClick: () => {
            if (isLast) {
              setTimeout(() => finish(true, true), 0);
            } else {
              setTimeout(() => performStep(index + 1), 0);
            }
          },
          onPrevClick: () => {
            if (!isFirst) setTimeout(() => performStep(index - 1), 0);
          },
          onCloseClick: () => setTimeout(() => finish(true), 0),
        },
      });
    };

    await performStep(0);
  }, [navigate, location.pathname, stepAllowed, t]);

  const value = useMemo<GuidedTourContextValue>(() => ({
    start,
    isCompleted: (id) => readCompleted().includes(id),
    resetAll: () => { writeCompleted([]); force((x) => x + 1); },
    reset: (id) => { writeCompleted(readCompleted().filter((x) => x !== id)); force((x) => x + 1); },
  }), [start]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useGuidedTour = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useGuidedTour must be used within GuidedTourProvider");
  return v;
};
