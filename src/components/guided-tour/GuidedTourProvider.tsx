import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import "./tour-styles.css";
import { allTours } from "@/tours/tourDefinitions";
import type { TourId, TourStep } from "@/tours/types";
import { waitForElement, sleep, closeMobileNav } from "@/tours/tourUtils";
import { useAuth } from "@/contexts/AuthContext";

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
  const driverRef = useRef<Driver | null>(null);
  const [, force] = useState(0);

  const stepAllowed = useCallback((s: TourStep) => {
    if (s.requiresAdmin && !isAdmin) return false;
    if (s.requiresSuperAdmin && !isSuperAdmin) return false;
    if (s.requiresModule && !hasTrainingModuleAccess(s.requiresModule as any)) return false;
    return true;
  }, [isAdmin, isSuperAdmin, hasTrainingModuleAccess]);

  const start = useCallback(async (tourId: TourId) => {
    const tour = allTours[tourId];
    if (!tour) return;

    const candidates = tour.steps.filter(stepAllowed);
    if (!candidates.length) return;

    const cleanupTourUi = () => {
      setMapInteraction(false);
      setTourActive(false);
      setTourId(null);
      void closeMobileNav();
    };

    // Destroy any previous tour cleanly first.
    try { driverRef.current?.destroy(); } catch {}
    cleanupTourUi();

    const finish = (markComplete: boolean) => {
      try { d.destroy(); } catch {}
      cleanupTourUi();
      if (markComplete) {
        const completed = readCompleted();
        if (!completed.includes(tourId)) writeCompleted([...completed, tourId]);
      }
      force((x) => x + 1);
    };

    const d: Driver = driver({
      allowClose: true,
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
          skip.textContent = "Hopp over";
          skip.onclick = () => finish(true);
          popover.footerButtons.prepend(skip);
        }
      },
      onDestroyStarted: (_element, _step, { driver }) => {
        // Fires for overlay click / ESC before driver removes its own overlay.
        cleanupTourUi();
        try { driver.destroy(); } catch {}
        setTimeout(() => force((x) => x + 1), 0);
      },
      onDestroyed: cleanupTourUi,
    });

    driverRef.current = d;
    setTourActive(true);
    setTourId(tourId);

    const performStep = async (index: number) => {
      const step = candidates[index];
      if (!step) {
        finish(true);
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
      const progress = `Steg ${index + 1} av ${candidates.length}`;

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
          nextBtnText: isLast ? "Fullfør" : "Neste →",
          prevBtnText: "← Tilbake",
          onNextClick: () => {
            if (isLast) {
              setTimeout(() => finish(true), 0);
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
  }, [navigate, location.pathname, stepAllowed]);

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
