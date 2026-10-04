import { useEffect, useRef, useState } from 'react';
import { useSyncExternalStore } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  dismissForceReloadBanner,
  getForceReloadState,
  performReload,
  subscribeForceReload,
} from '@/hooks/useForceReload';
import { useHasOpenModal } from '@/hooks/useHasOpenModal';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

const LATER_SNOOZE_MS = 30 * 60 * 1000; // 30 min

// Tidspunkt for siste «Senere»-trykk (modulnivå — overlever remontering).
let snoozedUntil = 0;

export const ForceReloadBanner = () => {
  const { t } = useTranslation();
  const state = useSyncExternalStore(subscribeForceReload, getForceReloadState);
  const hasOpenModal = useHasOpenModal();
  const [reloading, setReloading] = useState(false);
  const [snoozed, setSnoozed] = useState(false);
  const bannerRef = useRef<HTMLDivElement | null>(null);

  const forced = state.forceImmediate;
  // «Senere» gjelder kun det vanlige banneret — tvungne oppdateringer
  // kan aldri snoozes. Vanlig banner skjules også helt mens en modal
  // er åpen (vises igjen når modalen lukkes, med mindre «Senere» er
  // trykket). Tvungent banner vises også med åpen modal — dialogene
  // krymper via --update-banner-h.
  const snoozeActive = snoozed || Date.now() < snoozedUntil;
  const visible = state.showBanner && (forced || (!snoozeActive && !hasOpenModal));

  // Mål bannerhøyden slik at dialoger kan krympe unna (--update-banner-h).
  // Når tastaturet er oppe ligger banneret bak tastaturet i iOS — sett
  // variabelen til 0 så dialogene ikke krymper unødvendig.
  useEffect(() => {
    const el = bannerRef.current;
    if (!visible || !el) {
      document.documentElement.style.setProperty('--update-banner-h', '0px');
      return;
    }
    const setH = (h: number) =>
      document.documentElement.style.setProperty('--update-banner-h', `${h}px`);
    const isKeyboardUp = () =>
      !!window.visualViewport &&
      window.innerHeight - window.visualViewport.height > 150;
    const update = () => setH(isKeyboardUp() ? 0 : el.getBoundingClientRect().height);
    update();
    // Border-box: contentRect mangler padding.
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      vv?.removeEventListener('resize', update);
      document.documentElement.style.setProperty('--update-banner-h', '0px');
    };
  }, [visible]);

  // «Senere»-snooze utløper: vis banneret igjen når tiden er ute.
  useEffect(() => {
    if (!snoozed) return;
    const remaining = snoozedUntil - Date.now();
    if (remaining <= 0) {
      setSnoozed(false);
      return;
    }
    const timer = setTimeout(() => setSnoozed(false), remaining);
    return () => clearTimeout(timer);
  }, [snoozed]);

  if (!visible) return null;

  return (
    <div
      ref={bannerRef}
      className="fixed bottom-0 left-0 right-0 z-[9999] pointer-events-auto bg-primary text-primary-foreground px-4 py-3 flex items-center justify-center gap-3 shadow-lg flex-wrap"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
    >
      <RefreshCw className={`h-4 w-4 ${reloading ? 'animate-spin' : ''}`} />
      <span className="text-sm font-medium">
        {forced ? t('forceReload.required') : t('forceReload.available')}
      </span>
      <Button
        size="sm"
        variant="secondary"
        disabled={reloading}
        onClick={() => {
          setReloading(true);
          performReload();
        }}
      >
        {reloading ? t('forceReload.updating') : t('forceReload.updateNow')}
      </Button>
      {!forced && (
        <>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              snoozedUntil = Date.now() + LATER_SNOOZE_MS;
              setSnoozed(true);
              dismissForceReloadBanner();
            }}
          >
            {t('forceReload.later')}
          </Button>
          {!hasOpenModal && (
            <Link to="/changelog" className="text-sm underline underline-offset-2 hover:opacity-80">
              {t('forceReload.changelog')}
            </Link>
          )}
        </>
      )}
    </div>
  );
};
