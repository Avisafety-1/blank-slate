/**
 * Quota-resilient localStorage wrapper.
 *
 * Safari on iOS (especially in PWA standalone mode) has a very tight
 * localStorage quota (~5 MB, sometimes less). When the quota is full,
 * any `setItem` throws `QuotaExceededError`. If this happens inside the
 * Supabase auth client, login fails with "the quota has been exceeded".
 *
 * This wrapper:
 *  1. Tries the write normally.
 *  2. On quota error, evicts low-priority cache entries and retries.
 *  3. If it still fails, falls back to in-memory storage for the rest
 *     of the session — the user stays logged in for the current session
 *     but tokens are not persisted across app restarts.
 *
 * Also exposes `evictOfflineCaches()` for proactive cleanup.
 */

const OFFLINE_PREFIXES = [
  'offline_',
  'offlineCache_',
  'avisafe_query_cache',
];

const PROFILE_CACHE_PREFIX = 'avisafe_profile_cache_';

const memoryStore = new Map<string, string>();
let useMemoryFallback = false;

function isQuotaError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const err = e as { name?: string; code?: number; message?: string };
  return (
    err.name === 'QuotaExceededError' ||
    err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    err.code === 22 ||
    err.code === 1014 ||
    (typeof err.message === 'string' &&
      err.message.toLowerCase().includes('quota'))
  );
}

/**
 * Delete all `offline_*` / `offlineCache_*` / `avisafe_query_cache` keys.
 * Returns the number of keys removed.
 */
export function evictOfflineCaches(): number {
  let removed = 0;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (OFFLINE_PREFIXES.some((p) => key.startsWith(p))) {
        toRemove.push(key);
      }
    }
    for (const k of toRemove) {
      try {
        localStorage.removeItem(k);
        removed++;
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return removed;
}

/**
 * Delete `avisafe_profile_cache_*` keys for users other than `keepUserId`.
 */
export function evictOtherProfileCaches(keepUserId: string | null): number {
  let removed = 0;
  try {
    const keepKey = keepUserId ? `${PROFILE_CACHE_PREFIX}${keepUserId}` : null;
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith(PROFILE_CACHE_PREFIX) && key !== keepKey) {
        toRemove.push(key);
      }
    }
    for (const k of toRemove) {
      try {
        localStorage.removeItem(k);
        removed++;
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return removed;
}

/**
 * Safely set a localStorage item. Returns true on success.
 * On quota error, evicts caches and retries; falls back to memory if needed.
 */
export function safeSetItem(key: string, value: string): boolean {
  if (useMemoryFallback) {
    memoryStore.set(key, value);
    return true;
  }
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    if (!isQuotaError(e)) {
      // Non-quota error (e.g., security/disabled storage) — go memory
      console.warn('safeStorage: setItem failed, switching to memory fallback', e);
      useMemoryFallback = true;
      memoryStore.set(key, value);
      return true;
    }
    // Quota error: evict and retry
    console.warn('safeStorage: quota exceeded, evicting offline caches and retrying');
    const removed = evictOfflineCaches();
    if (removed > 0) {
      try {
        localStorage.setItem(key, value);
        return true;
      } catch (e2) {
        if (!isQuotaError(e2)) {
          useMemoryFallback = true;
          memoryStore.set(key, value);
          return true;
        }
      }
    }
    // Still failing — also evict other profile caches
    evictOtherProfileCaches(null);
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      // Give up on disk: use in-memory fallback for the rest of the session
      console.warn('safeStorage: still over quota, switching to memory fallback');
      useMemoryFallback = true;
      memoryStore.set(key, value);
      return true;
    }
  }
}

export function safeGetItem(key: string): string | null {
  if (useMemoryFallback && memoryStore.has(key)) {
    return memoryStore.get(key) ?? null;
  }
  try {
    return localStorage.getItem(key);
  } catch {
    return memoryStore.get(key) ?? null;
  }
}

export function safeRemoveItem(key: string): void {
  memoryStore.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * Storage adapter compatible with Supabase auth's `storage` option.
 * Supabase calls these three methods synchronously to persist the session.
 */
export const safeAuthStorage = {
  getItem: (key: string): string | null => safeGetItem(key),
  setItem: (key: string, value: string): void => {
    safeSetItem(key, value);
  },
  removeItem: (key: string): void => {
    safeRemoveItem(key);
  },
};

export function isUsingMemoryFallback(): boolean {
  return useMemoryFallback;
}
