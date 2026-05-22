/**
 * Generic offline cache helper using localStorage.
 * Stores fetched data with timestamps for TTL-based expiry.
 *
 * Quota-aware: keeps total bytes of `offline_*` / `offlineCache_*` entries
 * under MAX_TOTAL_BYTES by evicting oldest entries first. On quota errors,
 * delegates to safeStorage which evicts and falls back to memory.
 */

import { safeSetItem, evictOfflineCaches } from './safeStorage';

const DEFAULT_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

// Soft budget for offline cache (iPad PWA quota is ~5 MB total).
// Leave room for Supabase auth tokens, query cache, etc.
const MAX_TOTAL_BYTES = 2 * 1024 * 1024; // 2 MB

const OFFLINE_PREFIXES = ['offline_', 'offlineCache_'];

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * Get cached data from localStorage.
 * Returns null if no cache exists or if data has expired.
 */
export function getCachedData<T>(key: string, maxAge: number = DEFAULT_MAX_AGE): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const entry: CacheEntry<T> = JSON.parse(raw);

    // Check TTL
    if (Date.now() - entry.timestamp > maxAge) {
      try { localStorage.removeItem(key); } catch { /* ignore */ }
      return null;
    }

    return entry.data;
  } catch {
    return null;
  }
}

/**
 * Estimate total bytes used by offline_* / offlineCache_* keys and
 * evict the oldest entries until under MAX_TOTAL_BYTES.
 */
function enforceBudget(extraBytes: number): void {
  try {
    const entries: Array<{ key: string; bytes: number; timestamp: number }> = [];
    let total = 0;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (!OFFLINE_PREFIXES.some((p) => key.startsWith(p))) continue;

      const raw = localStorage.getItem(key);
      if (!raw) continue;

      const bytes = key.length + raw.length;
      total += bytes;

      let timestamp = 0;
      try {
        const parsed = JSON.parse(raw);
        timestamp = typeof parsed?.timestamp === 'number' ? parsed.timestamp : 0;
      } catch { /* ignore */ }

      entries.push({ key, bytes, timestamp });
    }

    if (total + extraBytes <= MAX_TOTAL_BYTES) return;

    // Evict oldest first
    entries.sort((a, b) => a.timestamp - b.timestamp);
    let toFree = total + extraBytes - MAX_TOTAL_BYTES;
    for (const e of entries) {
      if (toFree <= 0) break;
      try {
        localStorage.removeItem(e.key);
        toFree -= e.bytes;
      } catch { /* ignore */ }
    }
  } catch {
    /* ignore */
  }
}

/**
 * Store data in localStorage cache with current timestamp.
 * Enforces a total-size budget for offline caches.
 */
export function setCachedData<T>(key: string, data: T): void {
  let serialized: string;
  try {
    const entry: CacheEntry<T> = { data, timestamp: Date.now() };
    serialized = JSON.stringify(entry);
  } catch {
    return;
  }

  enforceBudget(key.length + serialized.length);

  const ok = safeSetItem(key, serialized);
  if (!ok) {
    // Last resort: clear all offline caches and try once more
    evictOfflineCaches();
    safeSetItem(key, serialized);
  }
}

/**
 * Remove cached data for a specific key.
 */
export function removeCachedData(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
