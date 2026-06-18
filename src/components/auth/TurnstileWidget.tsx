import { useEffect, useRef, useState } from "react";
import { shouldSkipCaptcha } from "@/lib/deviceDetection";

// Cloudflare Turnstile site key (offentlig — trygt å ha i frontend).
// Erstatt med din egen fra dash.cloudflare.com → Turnstile.
// Fallback: bruk Cloudflares "always passes" test-key så widget alltid laster
// i utvikling. Sett VITE_TURNSTILE_SITE_KEY i .env for produksjon.
const SITE_KEY =
  (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) ||
  "1x00000000000000000000AA"; // test key, alltid pass

const TURNSTILE_SCRIPT =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          appearance?: "always" | "execute" | "interaction-only";
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

let scriptPromise: Promise<boolean> | null = null;
function loadTurnstile(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.turnstile) return Promise.resolve(true);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<boolean>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-turnstile="1"]'
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(!!window.turnstile));
      existing.addEventListener("error", () => resolve(false));
      return;
    }
    const s = document.createElement("script");
    s.src = TURNSTILE_SCRIPT;
    s.async = true;
    s.defer = true;
    s.dataset.turnstile = "1";
    s.onload = () => resolve(!!window.turnstile);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
    // 5s timeout fallback
    setTimeout(() => resolve(!!window.turnstile), 5000);
  });

  return scriptPromise;
}

interface TurnstileWidgetProps {
  onVerify: (token: string | null) => void;
  className?: string;
}

/**
 * Cloudflare Turnstile widget. Calls onVerify(token) when solved,
 * onVerify(null) on error/expiry/load failure.
 *
 * Returns null (renders nothing) for DJI controllers — caller may treat
 * this as "skipped".
 */
export function TurnstileWidget({ onVerify, className }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [skipped] = useState(() => shouldSkipCaptcha());
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (skipped) {
      console.info("[Turnstile] Skipped for DJI controller");
      onVerify(null);
      return;
    }

    let cancelled = false;
    loadTurnstile().then((ok) => {
      if (cancelled) return;
      if (!ok || !window.turnstile || !containerRef.current) {
        console.warn("[Turnstile] Script failed to load — login allowed without token");
        setLoadFailed(true);
        onVerify(null);
        return;
      }
      try {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          appearance: "interaction-only",
          theme: "auto",
          callback: (token) => {
            console.info("[Turnstile] Token generated");
            onVerify(token);
          },
          "error-callback": () => {
            console.warn("[Turnstile] Widget error");
            onVerify(null);
          },
          "expired-callback": () => {
            console.info("[Turnstile] Token expired");
            onVerify(null);
          },
        });
      } catch (err) {
        console.error("[Turnstile] Render failed", err);
        setLoadFailed(true);
        onVerify(null);
      }
    });

    return () => {
      cancelled = true;
      try {
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.remove(widgetIdRef.current);
        }
      } catch {
        /* noop */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skipped]);

  if (skipped || loadFailed) return null;
  return <div ref={containerRef} className={className} />;
}

/**
 * Imperative reset helper — use after a failed login to force a fresh token
 * on next attempt. Safe to call even if widget was skipped.
 */
export function resetTurnstile() {
  try {
    window.turnstile?.reset();
  } catch {
    /* noop */
  }
}
