import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { driver, type Driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import "./tour-styles.css";
import { allTours } from "@/tours/tourDefinitions";
import type { TourId, TourStep } from "@/tours/types";
import { waitForElement, sleep } from "@/tours/tourUtils";
import { useAuth } from "@/contexts/AuthContext";

const STORAGE_KEY = "avisafe.tours.completed";

interface GuidedTourContextValue {
  start: (tourId: TourId) => Promise<void>;
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

function closeMobileNavIfOpen() {
  const trigger = document.querySelector<HTMLElement>('[data-tour="mobile-nav-trigger"]');
  const open = document.querySelector('[role="menu"][data-state="open"]');
  if (trigger && open) trigger.click();
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

    // Build resolved steps (filter perms; navigate + wait happens during onHighlightStarted)
    const candidates = tour.steps.filter(stepAllowed);

    const driveSteps: DriveStep[] = [];
    for (const s of candidates) {
      driveSteps.push({
        element: s.selector,
        disableActiveInteraction: false,
        popover: {
          title: s.title,
          description: s.description,
          side: (s.side === "over" ? undefined : s.side) ?? "bottom",
          align: "start",
          popoverClass: "avisafe-tour",
        },
        // attach metadata for our handlers
        // @ts-expect-error custom
        _meta: s,
      });
    }

    if (!driveSteps.length) return;

    const d = driver({
      showProgress: true,
      progressText: "Steg {{current}} av {{total}}",
      nextBtnText: "Neste →",
      prevBtnText: "← Tilbake",
      doneBtnText: "Fullfør",
      allowClose: true,
      overlayOpacity: 0.55,
      stagePadding: 6,
      stageRadius: 8,
      smoothScroll: true,
      animate: true,
      popoverClass: "avisafe-tour",
      steps: driveSteps,
      onPopoverRender: (popover) => {
        // Inject a "Hopp over" button next to close
        if (popover.footerButtons && !popover.footerButtons.querySelector(".avisafe-skip-btn")) {
          const skip = document.createElement("button");
          skip.className = "avisafe-skip-btn";
          skip.textContent = "Hopp over";
          skip.onclick = () => d.destroy();
          popover.footerButtons.prepend(skip);
        }
      },
      onDestroyed: () => {
        setMapInteraction(false);
        setTourActive(false);
        closeMobileNavIfOpen();
        const completed = readCompleted();
        if (!completed.includes(tourId)) writeCompleted([...completed, tourId]);
        force((x) => x + 1);
      },
    });

    driverRef.current = d;

    // Override moveNext to perform async navigate + wait per step
    const performStep = async (index: number) => {
      const step = candidates[index];
      if (!step) {
        d.destroy();
        return;
      }

      // Navigate first if needed
      if (step.route && location.pathname !== step.route) {
        navigate(step.route);
        await sleep(250);
      }

      // beforeStep hook
      try { await step.beforeStep?.(); } catch {}

      // Wait for element
      const el = await waitForElement(step.selector, step.optional === false ? 4000 : 1500);
      if (!el) {
        // skip silently
        return performStep(index + 1);
      }

      setMapInteraction(Boolean(step.allowMapInteraction));

      // Drive to this step
      d.drive(index);
    };

    // Hijack default next/prev by listening to clicks on rendered buttons.
    // driver.js fires onNextClick / onPrevClick we can override.
    d.setConfig({
      ...d.getConfig(),
      onNextClick: () => {
        const i = d.getActiveIndex();
        if (typeof i === "number") performStep(i + 1);
        else d.destroy();
      },
      onPrevClick: () => {
        const i = d.getActiveIndex();
        if (typeof i === "number" && i > 0) performStep(i - 1);
      },
    });

    setTourActive(true);
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
