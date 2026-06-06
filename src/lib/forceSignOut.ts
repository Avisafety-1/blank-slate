/**
 * Hard sign-out helper used when we detect that a session is permanently
 * unrecoverable (e.g. refresh token expired/revoked, or the auth state is
 * oscillating between login and dashboard). It:
 *
 *  1. Clears all Supabase + AviSafe auth-related localStorage keys.
 *  2. Broadcasts SIGNED_OUT to other tabs.
 *  3. Hard-navigates to /auth?expired=1 (replace), which kills any in-flight
 *     React state / timers and prevents the dashboard from rendering again.
 *
 * Idempotent — calling it multiple times only triggers one redirect.
 */
import { broadcastSignOut } from './authTabSync';

let didForceSignOut = false;

export function isPermanentAuthError(err: unknown): boolean {
  if (!err) return false;
  const e = err as any;
  const parts = [
    e?.message,
    e?.error_description,
    e?.code,
    e?.error,
    e?.name,
    typeof e?.status === 'number' ? String(e.status) : '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (!parts) return false;

  return (
    parts.includes('refresh_token_not_found') ||
    parts.includes('refresh token not found') ||
    parts.includes('invalid refresh token') ||
    parts.includes('invalid_grant') ||
    parts.includes('jwt expired') ||
    parts.includes('user_not_found') ||
    parts.includes('user from sub claim in jwt does not exist') ||
    parts.includes('authsessionmissingerror') ||
    // generic 400/401 from /auth/v1/token
    /\b(400|401)\b/.test(parts)
  );
}

export function forceFullSignOut(reason: string = 'unknown'): void {
  if (didForceSignOut) return;
  didForceSignOut = true;

  console.warn(`forceFullSignOut: hard sign-out triggered (${reason})`);

  // 1. Wipe auth-related localStorage
  try {
    localStorage.removeItem('avisafe_session_cache');
    localStorage.removeItem('avisafe_query_cache');
    localStorage.removeItem('avisafe_refresh_lock');
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
        localStorage.removeItem(key);
      }
      if (key.startsWith('avisafe_user_profile_')) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // ignore storage failures
  }

  // 2. Tell other tabs
  try {
    broadcastSignOut();
  } catch {
    // ignore
  }

  // 3. Hard navigation to login — drops all React state and pending queries.
  try {
    const isOnAuth = window.location.pathname === '/auth';
    if (!isOnAuth) {
      window.location.replace('/auth?expired=1');
    } else {
      // Already on /auth — at least make sure the expired flag is present
      if (!window.location.search.includes('expired=1')) {
        window.location.replace('/auth?expired=1');
      }
    }
  } catch {
    // ignore
  }
}
