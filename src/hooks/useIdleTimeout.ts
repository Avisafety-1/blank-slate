import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const WARNING_TIME_MS = 55 * 60 * 1000; // 55 minutes
const LOGOUT_TIME_MS = 60 * 60 * 1000;  // 60 minutes
const COUNTDOWN_TOTAL_S = Math.floor((LOGOUT_TIME_MS - WARNING_TIME_MS) / 1000); // 300s

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "mousemove", "keydown", "scroll", "touchstart", "click"
];

export function useIdleTimeout() {
  const { user, signOut } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(COUNTDOWN_TOTAL_S);

  const warningTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const countdownRef = useRef<ReturnType<typeof setInterval>>();
  const hasActiveFlightRef = useRef(false);

  const clearAllTimers = useCallback(() => {
    clearTimeout(warningTimerRef.current);
    clearTimeout(logoutTimerRef.current);
    clearInterval(countdownRef.current);
  }, []);

  const handleLogout = useCallback(async () => {
    clearAllTimers();
    setShowWarning(false);
    await signOut();
  }, [signOut, clearAllTimers]);

  const startCountdown = useCallback(() => {
    setRemainingSeconds(COUNTDOWN_TOTAL_S);
    countdownRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const resetTimers = useCallback(() => {
    // Skip if offline or has active flight
    if (!navigator.onLine || hasActiveFlightRef.current) return;

    clearAllTimers();
    setShowWarning(false);
    setRemainingSeconds(COUNTDOWN_TOTAL_S);

    warningTimerRef.current = setTimeout(() => {
      // Re-check before showing warning
      if (!navigator.onLine || hasActiveFlightRef.current) return;
      setShowWarning(true);
      startCountdown();
      logoutTimerRef.current = setTimeout(handleLogout, LOGOUT_TIME_MS - WARNING_TIME_MS);
    }, WARNING_TIME_MS);
  }, [clearAllTimers, startCountdown, handleLogout]);

  const extendSession = useCallback(() => {
    resetTimers();
  }, [resetTimers]);

  // Check active flights periodically
  useEffect(() => {
    if (!user) return;

    const checkActiveFlights = async () => {
      const { count } = await (supabase as any)
        .from("active_flights")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", user.id);
      hasActiveFlightRef.current = (count ?? 0) > 0;

      // If flight just became active while warning is showing, dismiss it
      if (hasActiveFlightRef.current) {
        clearAllTimers();
        setShowWarning(false);
      }
    };

    checkActiveFlights();
    const interval = setInterval(checkActiveFlights, 60_000); // check every minute
    return () => clearInterval(interval);
  }, [user, clearAllTimers]);

  // Set up activity listeners
  useEffect(() => {
    if (!user) return;

    // Throttle activity handler to avoid excessive timer resets
    let lastReset = 0;
    const handleActivity = () => {
      const now = Date.now();
      if (now - lastReset < 10_000) return; // throttle to every 10s
      lastReset = now;
      if (!showWarning) {
        resetTimers();
      }
    };

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, handleActivity, { passive: true }));
    resetTimers(); // initial start

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, handleActivity));
      clearAllTimers();
    };
  }, [user, resetTimers, clearAllTimers, showWarning]);

  // Handle online/offline transitions
  useEffect(() => {
    const onOnline = () => resetTimers();
    const onOffline = () => {
      clearAllTimers();
      setShowWarning(false);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [resetTimers, clearAllTimers]);

  return { showWarning, remainingSeconds, extendSession, logout: handleLogout };
}
