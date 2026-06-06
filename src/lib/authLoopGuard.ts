/**
 * Detects rapid oscillation between authenticated routes (dashboard, etc.)
 * and the /auth route. If we record more than MAX_TRANSITIONS transitions
 * within WINDOW_MS, we assume the auth state is broken and trigger a hard
 * sign-out via forceFullSignOut().
 *
 * Used as a safety net so users never get stuck in a blinking login loop.
 */
import { forceFullSignOut } from './forceSignOut';

const STORAGE_KEY = 'avisafe_auth_loop_log';
const WINDOW_MS = 4_000;
const MAX_TRANSITIONS = 4;

type Side = 'app' | 'auth';

function readLog(): number[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((n) => typeof n === 'number') : [];
  } catch {
    return [];
  }
}

function writeLog(timestamps: number[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(timestamps));
  } catch {
    // ignore
  }
}

export function recordAuthRouteVisit(side: Side): void {
  try {
    const now = Date.now();
    const log = readLog().filter((t) => now - t < WINDOW_MS);
    // Only record if this is a different side from the previous entry —
    // we want to count *transitions*, not duplicate renders of the same page.
    const lastEntry = sessionStorage.getItem(STORAGE_KEY + '_side');
    if (lastEntry !== side) {
      log.push(now);
      try { sessionStorage.setItem(STORAGE_KEY + '_side', side); } catch {}
    }
    writeLog(log);

    if (log.length > MAX_TRANSITIONS) {
      console.error(
        `authLoopGuard: detected ${log.length} app<->auth transitions in ${WINDOW_MS}ms — forcing sign-out`
      );
      try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
      try { sessionStorage.removeItem(STORAGE_KEY + '_side'); } catch {}
      forceFullSignOut('loop-detected');
    }
  } catch {
    // ignore
  }
}

export function clearAuthLoopLog(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY + '_side');
  } catch {
    // ignore
  }
}
