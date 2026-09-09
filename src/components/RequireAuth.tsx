import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import LoadingSpinner from "@/components/LoadingSpinner";

/**
 * Route-level auth guard.
 *
 * Anonymous visitors hitting a deep link (e.g. an incident link from an email)
 * are sent straight to the login page with ?next=<original path>, instead of
 * rendering page content or plan-gating screens.
 *
 * Never redirects while auth is still initialising/refreshing, or while
 * offline with a cached session — that would kick users out on a refresh.
 */
export const RequireAuth = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, authInitialized, authRefreshing } = useAuth();
  const location = useLocation();

  if (user) return <>{children}</>;

  if (loading || !authInitialized || authRefreshing) {
    return <LoadingSpinner />;
  }

  // Offline: don't bounce to login (login would fail anyway); let the page
  // render from cache and show its own offline banner.
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return <>{children}</>;
  }

  const next = `${location.pathname}${location.search}`;
  const target =
    next && next !== "/" ? `/auth?next=${encodeURIComponent(next)}` : "/auth";

  return <Navigate to={target} replace />;
};
