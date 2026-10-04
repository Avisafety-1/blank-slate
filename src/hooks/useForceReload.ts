import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { processQueue } from '@/lib/offlineQueue';
import { hasOpenModal, onLastModalClosed } from '@/lib/modalState';

const VERSION_KEY = 'avisafe_app_version';
const VERSION_CHECK_THROTTLE_MS = 60_000;

function getLocalVersion(): string | null {
  return localStorage.getItem(VERSION_KEY);
}

function setLocalVersion(v: string) {
  localStorage.setItem(VERSION_KEY, v);
}

// Track the pending version so performReload can persist it
let pendingVersion: string | null = null;

interface ForceReloadState {
  showBanner: boolean;
  forceImmediate: boolean;
}

let globalState: ForceReloadState = { showBanner: false, forceImmediate: false };
let listeners: Set<() => void> = new Set();

const notify = () => listeners.forEach(fn => fn());

export const getForceReloadState = () => globalState;

export const subscribeForceReload = (fn: () => void) => {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
};

// Skjuler banneret («Senere»). Tvungne oppdateringer kan ikke skjules.
export function dismissForceReloadBanner() {
  if (globalState.forceImmediate) return;
  globalState = { ...globalState, showBanner: false };
  notify();
}

async function clearAllCaches() {
  // 1. Clear Cache Storage (service worker caches)
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    console.log('[ForceReload] Cleared Cache Storage');
  } catch (e) {
    console.warn('[ForceReload] Could not clear Cache Storage:', e);
  }

  // 2. Clear React Query persistence cache
  try {
    localStorage.removeItem('avisafe_query_cache');
    console.log('[ForceReload] Cleared React Query cache');
  } catch {}

  // 3. Clear offline data caches (keys starting with known prefixes)
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('offlineCache_') || key.startsWith('avisafe_'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    console.log('[ForceReload] Cleared localStorage caches');
  } catch {}

  // 4. Trigger service worker update
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg) {
      await reg.update();
      console.log('[ForceReload] Triggered SW update');
    }
  } catch (e) {
    console.warn('[ForceReload] Could not update SW:', e);
  }
}

export async function performReload() {
  // Sync offline queue first to avoid data loss
  try {
    const result = await processQueue();
    if (result.synced > 0) {
      console.log(`[ForceReload] Synced ${result.synced} offline operations before reload`);
    }
  } catch (e) {
    console.warn('[ForceReload] Could not sync offline queue:', e);
  }

  // If we don't have a pending version from broadcast, fetch from DB
  if (!pendingVersion) {
    try {
      const { data } = await supabase
        .from('app_config')
        .select('value')
        .eq('key', 'app_version')
        .single();
      if (data?.value) pendingVersion = data.value;
    } catch {}
  }

  // Persist the new version BEFORE reload so the check won't trigger again
  if (pendingVersion) {
    setLocalVersion(pendingVersion);
    console.log(`[ForceReload] Saved version ${pendingVersion} to localStorage`);
    pendingVersion = null;
  }

  await clearAllCaches();
  window.location.reload();
}

// --- Pending reload state (deliberately module-level, shared by all callers) ---
let pendingForce: boolean | null = null;
let unsubscribeModalWatcher: (() => void) | null = null;

function ensureModalWatcher() {
  if (unsubscribeModalWatcher) return;
  unsubscribeModalWatcher = onLastModalClosed(() => {
    unsubscribeModalWatcher?.();
    unsubscribeModalWatcher = null;
    if (pendingForce !== null) {
      const force = pendingForce;
      pendingForce = null;
      requestReload(force);
    }
  });
}

/**
 * Ett inngangspunkt for alle oppdateringssignaler (broadcast og
 * versjonssjekk). Aldri reload mens et skjema er åpent — da vises et
 * banner i stedet, og tvungen reload skjer først når siste modal lukkes.
 */
export function requestReload(force: boolean) {
  if (document.visibilityState === 'hidden') {
    // Appen ligger i dvale — ta dette når den blir synlig igjen.
    // Nedgrader aldri en ventende tvungen oppdatering.
    pendingForce = force || pendingForce === true;
    return;
  }

  if (!hasOpenModal()) {
    pendingForce = null;
    if (force) {
      performReload();
    } else {
      globalState = { showBanner: true, forceImmediate: false };
      notify();
    }
    return;
  }

  // En modal er åpen — ikke forstyrre brukeren nå. Nedgrader aldri en
  // ventende tvungen oppdatering: bruk den sammenslåtte verdien når vi
  // avgjør om tvungent banner skal vises.
  const pending = force || pendingForce === true;
  pendingForce = pending;
  if (pending) {
    // Tvungen: vis banner (uten «Senere») mens dialogen er åpen, og reload
    // når siste modal lukkes. INGEN tidsgrense.
    globalState = { showBanner: true, forceImmediate: true };
    notify();
  }
  // Vanlig: banneret vises når siste modal lukkes (via watcher under).
  ensureModalWatcher();
}

export function useForceReload() {
  const { user } = useAuth();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastVersionCheckRef = useRef(0);

  useEffect(() => {
    if (!user) return;

    // --- Layer 1: Broadcast listener ---
    const channel = supabase.channel('global-force-reload');
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'reload' }, (payload) => {
        console.log('[ForceReload] Received broadcast signal', payload);
        const forceImmediate = payload?.payload?.forceImmediate === true;
        // Store version from broadcast so performReload can persist it
        if (payload?.payload?.version) {
          pendingVersion = payload.payload.version;
        }
        requestReload(forceImmediate);
      })
      .subscribe();

    // --- Layer 2: Version check on reconnect / foreground ---
    const handleOnline = async () => {
      const now = Date.now();
      if (now - lastVersionCheckRef.current < VERSION_CHECK_THROTTLE_MS) return;
      lastVersionCheckRef.current = now;

      try {
        const { data, error } = await supabase
          .from('app_config')
          .select('key, value')
          .in('key', ['app_version', 'app_version_force_immediate']);

        if (error) {
          console.warn('[ForceReload] Could not check app version:', error);
          return;
        }

        const appVersion = data?.find(r => r.key === 'app_version')?.value;
        const forcedVersion = data?.find(r => r.key === 'app_version_force_immediate')?.value;
        const localVer = getLocalVersion();

        // Forced update: local version is older than the force-flagged version.
        // Reload (uten banner når ingen modal er åpen). performReload persists
        // the new version BEFORE reloading, so this happens at most once per user.
        if (
          forcedVersion && localVer &&
          Number(localVer) < Number(forcedVersion) &&
          appVersion
        ) {
          console.log(`[ForceReload] Forced update: local=${localVer}, forced=${forcedVersion}`);
          pendingVersion = appVersion;
          requestReload(true);
          return;
        }

        if (appVersion && localVer && appVersion !== localVer) {
          console.log(`[ForceReload] Version mismatch: local=${localVer}, remote=${appVersion}`);
          pendingVersion = appVersion;
          requestReload(false);
        } else if (appVersion && !localVer) {
          // First visit — seed localStorage with current DB version
          setLocalVersion(appVersion);
        }
      } catch (e) {
        console.warn('[ForceReload] Version check failed:', e);
      }
    };

    const handleVisible = () => {
      if (document.visibilityState !== 'visible') return;
      // Ventende oppdatering fra da appen lå i dvale?
      if (pendingForce !== null) {
        const force = pendingForce;
        pendingForce = null;
        requestReload(force);
        return;
      }
      // iOS kobler fra realtime i dvale — sjekk versjonen ved tilbakekomst.
      handleOnline();
    };

    const handlePageShow = () => {
      // iOS bfcache: siden kan gjenopptas uten visibilitychange.
      handleVisible();
    };

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisible);
    window.addEventListener('pageshow', handlePageShow);

    // Also check on mount (in case user was offline and reloaded while online)
    if (navigator.onLine) {
      handleOnline();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener('pageshow', handlePageShow);
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [user?.id]);
}
