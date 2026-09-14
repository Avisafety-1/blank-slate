import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PilotCloudConfig = {
  appId: string;
  appKey: string;
  license: string;
  mqttHost: string;
  mqttUsername: string;
  mqttPassword: string;
};

type LogLine = { id: number; text: string; tone: "info" | "ok" | "err" };

declare global {
  interface Window {
    djiBridge?: {
      platformVerifyLicense: (appId: string, appKey: string, license: string) => unknown;
      platformLoadComponent: (name: string, config: string) => unknown;
      thingConnect: (username: string, password: string, callback: string) => unknown;
    };
    reg_callback?: (result: unknown) => void;
  }
}

const DjiCloudLogin = () => {
  const { t } = useTranslation();
  const [sessionReady, setSessionReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [config, setConfig] = useState<PilotCloudConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [status, setStatus] = useState("");
  const [log, setLog] = useState<LogLine[]>([]);
  const logId = useRef(0);

  const addLog = useCallback((text: string, tone: LogLine["tone"] = "info") => {
    logId.current += 1;
    const stamp = new Date().toISOString().substr(11, 8);
    setLog((prev) => [...prev, { id: logId.current, text: `${stamp}  ${text}`, tone }]);
  }, []);

  const say = useCallback(
    (text: string, tone: LogLine["tone"] = "info") => {
      setStatus(text);
      addLog(text, tone);
    },
    [addLog],
  );

  // Track auth state
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSignedIn(!!data.session);
      setSessionReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session);
      setSessionReady(true);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // DJI Pilot 2 invokes this global with the MQTT connection result
  useEffect(() => {
    window.reg_callback = (result: unknown) => {
      addLog(`reg_callback: ${JSON.stringify(result)}`, "ok");
      setStatus(t("djiCloud.callbackReceived"));
    };
    return () => {
      delete window.reg_callback;
    };
  }, [addLog, t]);

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

  const handleConnect = () => {
    if (!config) return;
    if (!window.djiBridge) {
      say(t("djiCloud.bridgeMissing"), "err");
      return;
    }

    // Explicit mapping: config fields -> djiBridge parameter names
    const appId = config.appId;
    const appKey = config.appKey;
    const license = config.license;
    const host = config.mqttHost; // mqttHost -> host (full URI incl. scheme + port)
    const username = config.mqttUsername; // mqttUsername -> username
    const password = config.mqttPassword; // mqttPassword -> password

    try {
      addLog("platformVerifyLicense…");
      window.djiBridge.platformVerifyLicense(appId, appKey, license);
      addLog("platformVerifyLicense called", "ok");

      addLog('platformLoadComponent("thing", …)');
      window.djiBridge.platformLoadComponent(
        "thing",
        JSON.stringify({ host, connectCallback: "reg_callback", username, password }),
      );
      addLog("platformLoadComponent called", "ok");

      addLog("thingConnect…");
      window.djiBridge.thingConnect(username, password, "reg_callback");
      addLog("thingConnect called — waiting for reg_callback", "ok");
      setStatus(t("djiCloud.connecting"));
    } catch (err) {
      say(t("djiCloud.connectFailed"), "err");
      addLog(String(err instanceof Error ? err.message : err), "err");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-4">
      <div className="mx-auto w-full max-w-md space-y-4">
        <h1 className="text-lg font-semibold">{t("djiCloud.title")}</h1>

        {!sessionReady && <p className="text-sm text-muted-foreground">{t("djiCloud.loading")}</p>}

        {sessionReady && !signedIn && (
          <form onSubmit={handleSignIn} className="space-y-3 rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">{t("djiCloud.signInHint")}</p>
            <div className="space-y-1">
              <Label htmlFor="dji-email">{t("djiCloud.email")}</Label>
              <Input
                id="dji-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dji-password">{t("djiCloud.password")}</Label>
              <Input
                id="dji-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={signingIn}>
              {signingIn ? t("djiCloud.signingIn") : t("djiCloud.signIn")}
            </Button>
          </form>
        )}

        {sessionReady && signedIn && (
          <div className="space-y-3">
            <Button
              type="button"
              size="lg"
              className="w-full h-14 text-base"
              disabled={!config}
              onClick={handleConnect}
            >
              {t("djiCloud.connect")}
            </Button>
            {!config && !loadingConfig && (
              <Button type="button" variant="outline" className="w-full" onClick={() => void loadConfig()}>
                {t("djiCloud.retryConfig")}
              </Button>
            )}
          </div>
        )}

        {status && <p className="text-sm">{status}</p>}

        {log.length > 0 && (
          <ul className="space-y-1 text-xs font-mono">
            {log.map((line) => (
              <li
                key={line.id}
                className={
                  line.tone === "err"
                    ? "text-destructive"
                    : line.tone === "ok"
                      ? "text-primary"
                      : "text-muted-foreground"
                }
              >
                {line.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default DjiCloudLogin;
