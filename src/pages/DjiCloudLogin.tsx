import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import droneBackground from "@/assets/drone-background.webp";
import avisafeLogo from "@/assets/avisafe-logo-text.png";

type PilotCloudConfig = {
  appId: string;
  appKey: string;
  license: string;
  mqttHost: string;
  mqttUsername: string;
  mqttPassword: string;
};

type LogLine = { id: number; text: string; tone: "info" | "ok" | "err" };
type ConnState = "idle" | "connecting" | "connected" | "failed";

declare global {
  interface Window {
    djiBridge?: {
      platformVerifyLicense: (appId: string, appKey: string, license: string) => unknown;
      platformLoadComponent: (name: string, config: string) => unknown;
      thingConnect: (username: string, password: string, callback: string) => unknown;
      platformSetWorkspaceId?: (uuid: string) => unknown;
      platformSetInformation?: (platformName: string, workspaceName: string, desc: string) => unknown;
      platformIsVerified?: () => unknown;
      platformIsComponentLoaded?: (name: string) => unknown;
      thingGetConnectState?: () => unknown;

    };
    reg_callback?: (result: unknown) => void;
    onStopPlatform?: () => unknown;
    onBackClick?: () => boolean;
  }
}


/** Auto-reconnect when the last callback is older than this (ms). */
const STALE_MS = 30000;

const DjiCloudLogin = () => {
  const { t } = useTranslation();
  const [sessionReady, setSessionReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [config, setConfig] = useState<PilotCloudConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [status, setStatus] = useState("");
  const [log, setLog] = useState<LogLine[]>([]);
  const [connState, setConnState] = useState<ConnState>("idle");
  const [lastCallbackAt, setLastCallbackAt] = useState<Date | null>(null);
  const [workspace, setWorkspace] = useState<{ id: string | null; name: string | null }>({
    id: null,
    name: null,
  });

  const logId = useRef(0);
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const lastCallbackRef = useRef<number>(0);
  const connectRef = useRef<(force?: boolean) => void>(() => {});
  const connectingRef = useRef(false);
  const version = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "unknown";


  const addLog = useCallback((text: string, tone: LogLine["tone"] = "info") => {
    logId.current += 1;
    const stamp = new Date().toISOString().substr(11, 8);
    setLog((prev) => [...prev.slice(-300), { id: logId.current, text: `${stamp}  ${text}`, tone }]);
  }, []);

  const say = useCallback(
    (text: string, tone: LogLine["tone"] = "info") => {
      setStatus(text);
      addLog(text, tone);
    },
    [addLog],
  );

  // DJI bridge calls return a JSON string like {"code":0,"message":"","data":...}
  const parseBridge = useCallback((raw: unknown): { code: number | null; text: string } => {
    if (raw === undefined || raw === null) return { code: null, text: "(no return value)" };
    const text = typeof raw === "string" ? raw : JSON.stringify(raw);
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === "object" && "code" in (parsed as Record<string, unknown>)) {
        const code = Number((parsed as Record<string, unknown>).code);
        return { code: Number.isNaN(code) ? null : code, text };
      }
    } catch {
      /* not JSON — log raw */
    }
    return { code: null, text };
  }, []);

  /**
   * Ask DJI Pilot 2 whether the "thing" module is already connected, so we
   * never tear down a live MQTT link just because the webview was shown again.
   * Returns "unknown" on older bridges that lack the API — then we keep the
   * previous behaviour and connect.
   */
  const readConnectState = useCallback((): "connected" | "disconnected" | "unknown" => {
    const bridge = window.djiBridge;
    if (!bridge?.thingGetConnectState) return "unknown";
    let raw: unknown;
    try {
      raw = bridge.thingGetConnectState();
    } catch {
      return "unknown";
    }
    const { text } = parseBridge(raw);
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      const value =
        parsed && typeof parsed === "object"
          ? ((parsed as Record<string, unknown>).data ?? (parsed as Record<string, unknown>).result)
          : parsed;
      if (typeof value === "boolean") return value ? "connected" : "disconnected";
      if (value && typeof value === "object") {
        const obj = value as Record<string, unknown>;
        if (typeof obj.connectState === "boolean") return obj.connectState ? "connected" : "disconnected";
        if (typeof obj.state === "boolean") return obj.state ? "connected" : "disconnected";
      }
    } catch {
      /* fall through to text matching */
    }
    if (/true/i.test(text)) return "connected";
    if (/false/i.test(text)) return "disconnected";
    return "unknown";
  }, [parseBridge]);



  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: "end" });
  }, [log]);

  // Track auth state
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSignedIn(!!data.session);
      setAccountEmail(data.session?.user?.email ?? null);
      setSessionReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session);
      setAccountEmail(session?.user?.email ?? null);
      setSessionReady(true);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Workspace identity for DJI Pilot 2. Registering the platform with a
  // workspace id + name is what makes Pilot 2 treat this as a real cloud
  // platform (home screen shows the workspace instead of "Not Logged In")
  // instead of a loose web page it tears down when leaving the menu.
  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", userId)
        .maybeSingle();
      const companyId = (profile as { company_id?: string | null } | null)?.company_id ?? null;
      let companyName: string | null = null;
      if (companyId) {
        const { data: company } = await supabase
          .from("companies")
          .select("name")
          .eq("id", companyId)
          .maybeSingle();
        companyName = (company as { name?: string | null } | null)?.name ?? null;
      }
      if (!active) return;
      setWorkspace({ id: companyId, name: companyName });
      addLog(`workspace: ${companyName ?? "(ukjent)"} / ${companyId ?? "(mangler id)"}`);
    })();
    return () => {
      active = false;
    };
  }, [addLog, signedIn]);



  // Log running build version and make sure this page never runs from an old
  // service-worker cache (DJI Pilot 2's webview caches aggressively).
  useEffect(() => {
    addLog(`AviSafe /dji build: ${version}`);
    void (async () => {
      try {
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const reg of regs) await reg.unregister();
          if (regs.length > 0) addLog(`Unregistered ${regs.length} service worker(s)`);
        }
        if ("caches" in window) {
          const keys = await caches.keys();
          for (const key of keys) await caches.delete(key);
          if (keys.length > 0) addLog(`Cleared ${keys.length} cache(s)`);
        }
      } catch {
        /* ignore — cache cleanup is best effort */
      }
    })();
  }, [addLog, version]);

  const handleClearCache = async () => {
    const refreshPath = `/dji/refresh-${Date.now()}`;
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) await reg.unregister();
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        for (const key of keys) await caches.delete(key);
      }
      // Allow the /dji version guard (injected into index.html) to run again.
      try {
        sessionStorage.removeItem("dji_version_reload");
      } catch {
        /* ignore */
      }
      // Warm a completely new navigation URL from the network. DJI Pilot 2's
      // Android WebView may keep its ordinary HTTP cache even after Cache
      // Storage and service workers have been cleared, and may also ignore a
      // query-only cache buster. A unique path forces a fresh document load.
      await fetch(refreshPath, {
        cache: "no-store",
        credentials: "include",
        headers: { "Cache-Control": "no-cache" },
      });
    } catch {
      /* ignore */
    }
    setStatus(t("djiCloud.cacheCleared"));
    window.location.replace(refreshPath);
  };

  // DJI Pilot 2 invokes this global with the MQTT connection result.
  // Registered once and deliberately NOT removed on unmount, so a late
  // callback from the bridge still lands somewhere.
  useEffect(() => {
    window.reg_callback = (result: unknown) => {
      addLog(`reg_callback: ${JSON.stringify(result)}`, "ok");
      lastCallbackRef.current = Date.now();
      setLastCallbackAt(new Date());
      let ok = false;
      try {
        const parsed = typeof result === "string" ? JSON.parse(result) : result;
        if (typeof parsed === "boolean") ok = parsed;
        else if (parsed && typeof parsed === "object") {
          const obj = parsed as Record<string, unknown>;
          ok = obj.code === 0 || obj.data === true || obj.result === true;
        }
      } catch {
        ok = String(result).toLowerCase() === "true";
      }
      setConnState(ok ? "connected" : "failed");
      setStatus(t(ok ? "djiCloud.statusConnected" : "djiCloud.statusFailed"));
    };
  }, [addLog, t]);

  // Heartbeat + visibility logging: tells us whether the webview or the MQTT
  // link is what goes away when the pilot leaves the cloud-service menu.
  useEffect(() => {
    const beat = window.setInterval(() => {
      if (lastCallbackRef.current === 0) return;
      const ageSec = Math.round((Date.now() - lastCallbackRef.current) / 1000);
      addLog(`heartbeat: siste reg_callback ${ageSec}s siden (visibility=${document.visibilityState})`);
    }, 10000);

    const onVisibility = () => {
      addLog(`visibilitychange -> ${document.visibilityState}`);
      if (document.visibilityState !== "visible") return;
      // Ask DJI first: reconnecting on top of a live link is what caused the
      // disconnect/connect cycle when returning to "Open Platforms".
      const state = readConnectState();
      addLog(`${t("djiCloud.checkingState")} -> ${state}`);
      if (state === "connected") {
        lastCallbackRef.current = Date.now();
        setConnState("connected");
        setStatus(t("djiCloud.alreadyConnected"));
        return;
      }
      if (lastCallbackRef.current === 0) {
        addLog("Ingen tilkoblingsbekreftelse mottatt – kobler til automatisk.");
        connectRef.current();
      } else if (Date.now() - lastCallbackRef.current > STALE_MS) {
        addLog("Tilkoblingen virker inaktiv – kobler til på nytt automatisk.");
        connectRef.current();
      }
    };

    const onPageHide = () => addLog("pagehide");

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(beat);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [addLog, readConnectState, t]);


  const loadConfig = useCallback(async () => {
    setLoadingConfig(true);
    say(t("djiCloud.loadingConfig"));
    const { data, error } = await supabase.functions.invoke("pilot-cloud-config");
    setLoadingConfig(false);
    if (error) {
      say(t("djiCloud.configFailed"), "err");
      addLog(String(error.message ?? error), "err");
      return;
    }
    setConfig(data as PilotCloudConfig);
    say(t("djiCloud.configLoaded"), "ok");
  }, [addLog, say, t]);

  useEffect(() => {
    if (signedIn && !config && !loadingConfig) void loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSigningIn(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSigningIn(false);
    if (error) {
      say(t("djiCloud.signInFailed"), "err");
      addLog(error.message, "err");
      return;
    }
    setPassword("");
    say(t("djiCloud.signedIn"), "ok");
  };

  const handleCopyLog = async () => {
    const text = log.map((l) => l.text).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setStatus(t("djiCloud.logCopied"));
    } catch {
      setStatus(text);
    }
  };

  const handleConnect = useCallback(
    (force = false) => {
      if (!config) return;
      if (!window.djiBridge) {
        say(t("djiCloud.bridgeMissing"), "err");
        setConnState("failed");
        return;
      }
      if (connectingRef.current && !force) {
        addLog("Tilkobling pågår allerede – hopper over nytt forsøk.");
        return;
      }

      // Never tear down a live link just because the webview was shown again.
      const existing = readConnectState();
      addLog(`thingGetConnectState -> ${existing}`);
      if (existing === "connected" && !force) {
        setConnState("connected");
        lastCallbackRef.current = Date.now();
        say(t("djiCloud.alreadyConnected"), "ok");
        return;
      }

      const { appId, appKey, license } = config;
      const host = config.mqttHost;
      const username = config.mqttUsername;
      const mqttPassword = config.mqttPassword;

      connectingRef.current = true;
      setConnState("connecting");
      try {
        addLog(`appId=${appId} host=${host} username=${username}`);
        addLog(`page origin=${window.location.origin}`);

        // Only register the platform once. Re-verifying and re-setting the
        // workspace on every return to the menu resets Pilot 2's platform
        // registration.
        let alreadyVerified = false;
        if (window.djiBridge.platformIsVerified) {
          const verified = parseBridge(window.djiBridge.platformIsVerified());
          addLog(`platformIsVerified -> ${verified.text}`);
          alreadyVerified = /true/i.test(verified.text);
        }

        if (!alreadyVerified || force) {
          addLog("platformVerifyLicense…");
          const verify = parseBridge(window.djiBridge.platformVerifyLicense(appId, appKey, license));
          addLog(`platformVerifyLicense -> ${verify.text}`, verify.code === 0 ? "ok" : "err");
          if (verify.code !== null && verify.code !== 0) {
            say(t("djiCloud.licenseFailed"), "err");
            setConnState("failed");
            connectingRef.current = false;
            return;
          }

          // Register the platform BEFORE loading the thing module. Without a
          // workspace id + platform information Pilot 2 treats the page as a
          // plain web page and drops the MQTT link when the pilot returns to
          // the home screen.
          if (workspace.id && window.djiBridge.platformSetWorkspaceId) {
            const ws = parseBridge(window.djiBridge.platformSetWorkspaceId(workspace.id));
            addLog(`platformSetWorkspaceId -> ${ws.text}`, ws.code === 0 || ws.code === null ? "ok" : "err");
          } else if (!workspace.id) {
            addLog("platformSetWorkspaceId hoppet over – mangler selskaps-id", "err");
          }
          if (window.djiBridge.platformSetInformation) {
            const info = parseBridge(
              window.djiBridge.platformSetInformation(
                "AviSafe",
                workspace.name ?? "AviSafe",
                t("djiCloud.platformDesc"),
              ),
            );
            addLog(`platformSetInformation -> ${info.text}`, info.code === 0 || info.code === null ? "ok" : "err");
          }
        } else {
          addLog("Plattformen er allerede registrert – hopper over lisens og arbeidsområde.");
        }

        let componentLoaded = false;
        if (window.djiBridge.platformIsComponentLoaded) {
          const loadedState = parseBridge(window.djiBridge.platformIsComponentLoaded("thing"));
          addLog(`platformIsComponentLoaded("thing") -> ${loadedState.text}`);
          componentLoaded = /true/i.test(loadedState.text);
        }

        if (!componentLoaded || force) {
          addLog('platformLoadComponent("thing", …)');
          const loaded = parseBridge(
            window.djiBridge.platformLoadComponent(
              "thing",
              JSON.stringify({ host, connectCallback: "reg_callback", username, password: mqttPassword }),
            ),
          );
          addLog(`platformLoadComponent -> ${loaded.text}`, loaded.code === 0 ? "ok" : "err");
          if (loaded.code !== null && loaded.code !== 0) {
            say(t("djiCloud.componentFailed"), "err");
            setConnState("failed");
            connectingRef.current = false;
            return;
          }
        } else {
          addLog("«thing»-modulen er allerede lastet – beholder den.");
        }

        addLog("thingConnect…");
        const connected = parseBridge(window.djiBridge.thingConnect(username, mqttPassword, "reg_callback"));
        addLog(`thingConnect -> ${connected.text}`, connected.code === 0 ? "ok" : "err");
        if (connected.code !== null && connected.code !== 0) {
          say(t("djiCloud.connectFailed"), "err");
          setConnState("failed");
          connectingRef.current = false;
          return;
        }
        setStatus(t("djiCloud.connecting"));
      } catch (err) {
        say(t("djiCloud.connectFailed"), "err");
        setConnState("failed");
        addLog(String(err instanceof Error ? err.message : err), "err");
      } finally {
        window.setTimeout(() => {
          connectingRef.current = false;
        }, 5000);
      }
    },
    [addLog, config, parseBridge, readConnectState, say, t, workspace.id, workspace.name],
  );


  // DJI exit hooks: onStopPlatform fires right before Pilot 2 tears the
  // platform down, onBackClick when the in-page back arrow is used. Returning
  // true from onBackClick keeps the platform (and the MQTT link) alive.
  useEffect(() => {
    window.onStopPlatform = () => {
      addLog("onStopPlatform – DJI Pilot 2 avslutter plattformen", "err");
      setConnState("idle");
      return true;
    };
    window.onBackClick = () => {
      addLog("onBackClick – beholder plattformen tilkoblet");
      return true;
    };
  }, [addLog]);


  useEffect(() => {
    connectRef.current = handleConnect;
  }, [handleConnect]);

  // The webview may be re-shown with an MQTT link still alive. Read DJI's own
  // state on mount so the button shows "Tilkoblet" instead of starting a new
  // connection that would drop the existing one.
  useEffect(() => {
    if (!window.djiBridge) return;
    const state = readConnectState();
    addLog(`${t("djiCloud.checkingState")} -> ${state}`);
    if (state === "connected") {
      lastCallbackRef.current = Date.now();
      setConnState("connected");
      setStatus(t("djiCloud.statusConnected"));
    }
  }, [addLog, readConnectState, t]);

  // DJI Pilot 2 expects the third-party platform to establish its native
  // cloud connection after the page has authenticated. Requiring a second
  // manual click leaves Pilot 2's home screen at "Not Logged In" and no
  // telemetry is sent after leaving the platform menu.
  useEffect(() => {
    if (!signedIn || !config || connState !== "idle") return;
    const timer = window.setTimeout(() => {
      if (readConnectState() === "connected") {
        setConnState("connected");
        lastCallbackRef.current = Date.now();
        addLog(t("djiCloud.alreadyConnected"), "ok");
        return;
      }
      handleConnect();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [addLog, config, connState, handleConnect, readConnectState, signedIn, t]);


  const connectLabel =
    connState === "connected"
      ? t("djiCloud.connected")
      : connState === "connecting"
        ? t("djiCloud.connectingShort")
        : connState === "failed"
          ? t("djiCloud.reconnect")
          : t("djiCloud.connect");

  const statusDot =
    connState === "connected"
      ? "bg-status-green"
      : connState === "connecting"
        ? "bg-status-yellow"
        : connState === "failed"
          ? "bg-status-red"
          : "bg-muted-foreground";

  const statusText =
    connState === "connected"
      ? t("djiCloud.statusConnected")
      : connState === "connecting"
        ? t("djiCloud.statusConnecting")
        : connState === "failed"
          ? t("djiCloud.statusFailed")
          : t("djiCloud.statusIdle");

  return (
    <div
      className="min-h-[100dvh] text-white"
      style={{
        backgroundImage: `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.7)), url(${droneBackground})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <img src={avisafeLogo} alt="AviSafe" className="h-6 w-auto brightness-0 invert" />
          <span className="text-xs text-white/60">{t("djiCloud.title")}</span>
        </div>

        {!sessionReady && <p className="text-sm text-white/70">{t("djiCloud.loading")}</p>}

        {sessionReady && !signedIn && (
          <form
            onSubmit={handleSignIn}
            className="mx-auto w-full max-w-3xl space-y-4 rounded-xl border border-white/15 bg-black/40 p-4 backdrop-blur-md"
          >
            <p className="text-sm text-white/75">{t("djiCloud.signInHint")}</p>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div className="space-y-1">
                <Label htmlFor="dji-email" className="text-white/80">
                  {t("djiCloud.email")}
                </Label>
                <Input
                  id="dji-email"
                  type="email"
                  autoComplete="username"
                  enterKeyHint="next"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={(e) => e.currentTarget.scrollIntoView({ block: "center", behavior: "smooth" })}
                  className="bg-white/10 text-white placeholder:text-white/40"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="dji-password" className="text-white/80">
                  {t("djiCloud.password")}
                </Label>
                <Input
                  id="dji-password"
                  type="password"
                  autoComplete="current-password"
                  enterKeyHint="go"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={(e) => e.currentTarget.scrollIntoView({ block: "center", behavior: "smooth" })}
                  className="bg-white/10 text-white placeholder:text-white/40"
                  required
                />
              </div>
              <Button type="submit" className="w-full sm:w-auto sm:min-w-[8rem]" disabled={signingIn}>
                {signingIn ? t("djiCloud.signingIn") : t("djiCloud.signIn")}
              </Button>
            </div>
            {status && <p className="text-sm text-white/80">{status}</p>}
          </form>
        )}

        {sessionReady && signedIn && (
          <div className="grid gap-3 lg:grid-cols-2">
            {/* Venstre: handling + logg */}
            <div className="flex min-h-0 flex-col gap-2 rounded-xl border border-white/15 bg-black/40 p-3 backdrop-blur-md">
              <Button
                type="button"
                size="lg"
                className={cn("h-14 w-full text-base", connState === "connected" && "bg-status-green hover:bg-status-green")}
                disabled={!config || connState === "connected" || connState === "connecting"}
                onClick={() => handleConnect(true)}
              >
                {connectLabel}
              </Button>
              {!config && !loadingConfig && (
                <Button type="button" variant="secondary" className="w-full" onClick={() => void loadConfig()}>
                  {t("djiCloud.retryConfig")}
                </Button>
              )}
              <div className="flex gap-2">
                {log.length > 0 && (
                  <Button type="button" variant="secondary" size="sm" onClick={() => void handleCopyLog()}>
                    {t("djiCloud.copyLog")}
                  </Button>
                )}
                <Button type="button" variant="secondary" size="sm" onClick={() => void handleClearCache()}>
                  {t("djiCloud.clearCache")}
                </Button>
              </div>
              <div className="h-[38vh] min-h-[160px] overflow-y-auto rounded-lg bg-black/40 p-2 font-mono text-[11px] leading-5">
                {log.map((line) => (
                  <div
                    key={line.id}
                    className={
                      line.tone === "err" ? "text-status-red" : line.tone === "ok" ? "text-status-green" : "text-white/70"
                    }
                  >
                    {line.text}
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>

            {/* Høyre: status */}
            <div className="space-y-3 rounded-xl border border-white/15 bg-black/40 p-4 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <span className={cn("h-4 w-4 rounded-full", statusDot)} />
                <span className="text-lg font-semibold">{statusText}</span>
              </div>
              <p className="text-sm text-white/80">
                {connState === "connected" ? t("djiCloud.liveSharingOn") : t("djiCloud.liveSharingOff")}
              </p>
              <p className="text-xs text-white/60">{t("djiCloud.keepOpenHint")}</p>
              <dl className="space-y-1 text-xs text-white/70">
                <div className="flex justify-between gap-2">
                  <dt>{t("djiCloud.account")}</dt>
                  <dd className="truncate">{accountEmail ?? "–"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>{t("djiCloud.workspace")}</dt>
                  <dd className="truncate">{workspace.name ?? "–"}</dd>
                </div>

                <div className="flex justify-between gap-2">
                  <dt>{t("djiCloud.host")}</dt>
                  <dd className="truncate">{config?.mqttHost ?? "–"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>{t("djiCloud.lastCallback")}</dt>
                  <dd>{lastCallbackAt ? lastCallbackAt.toLocaleTimeString() : "–"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>{t("djiCloud.build")}</dt>
                  <dd className="truncate">{version}</dd>
                </div>
              </dl>
              {status && <p className="text-sm text-white/80">{status}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DjiCloudLogin;
