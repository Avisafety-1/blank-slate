import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Copy, RefreshCw, Loader2, Plane, Info } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const FEED_FN = "flighthub2-airspace-feed";

interface LogRow {
  id: number;
  method: string;
  path: string;
  query: string | null;
  status_returned: number | null;
  matched_key: boolean;
  remote_ip: string | null;
  created_at: string;
}

export const FH2AirspaceFeedSection = () => {
  const { t } = useTranslation();
  const { companyId } = useAuth();
  const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID as
    | string
    | undefined;
  const feedUrl = projectRef
    ? `https://${projectRef}.functions.supabase.co/${FEED_FN}`
    : "";

  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [keyPrefix, setKeyPrefix] = useState<string | null>(null);
  const [lastRequestAt, setLastRequestAt] = useState<string | null>(null);
  const [showKey, setShowKey] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const [logs, setLogs] = useState<LogRow[]>([]);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    const [{ data: cfg }, { data: logRows }] = await Promise.all([
      supabase
        .from("fh2_airspace_feed_config")
        .select("enabled, api_key_prefix, last_request_at")
        .eq("company_id", companyId)
        .maybeSingle(),
      supabase
        .from("fh2_airspace_feed_log")
        .select("id, method, path, query, status_returned, matched_key, remote_ip, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    if (cfg) {
      setEnabled(cfg.enabled ?? true);
      setKeyPrefix(cfg.api_key_prefix);
      setLastRequestAt(cfg.last_request_at);
    } else {
      setKeyPrefix(null);
      setLastRequestAt(null);
    }
    setLogs((logRows ?? []) as LogRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const rotate = async () => {
    setRotating(true);
    const { data, error } = await supabase.functions.invoke(
      "flighthub2-airspace-feed-config",
      { body: { action: "rotate" } },
    );
    setRotating(false);
    if (error || !data?.api_key) {
      toast.error(t("admin.fh2Feed.errorGenerateKey"));
      return;
    }
    setShowKey(data.api_key);
    toast.success(t("admin.fh2Feed.keyGenerated"));
    load();
  };

  const toggle = async (val: boolean) => {
    setEnabled(val);
    const { error } = await supabase.functions.invoke(
      "flighthub2-airspace-feed-config",
      { body: { action: "set_enabled", enabled: val } },
    );
    if (error) {
      toast.error(t("admin.fh2Feed.errorUpdateStatus"));
      setEnabled(!val);
    }
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(t("admin.fh2Feed.copiedLabel", { label }));
  };

  return (
    <div className="relative space-y-4 rounded-lg border-2 border-destructive/50 bg-destructive/10 p-4 backdrop-blur-sm">
      <Alert variant="destructive" className="bg-destructive/20 border-destructive">
        <AlertTitle className="font-bold uppercase tracking-wide">{t("admin.fh2Feed.underDevelopment")}</AlertTitle>
        <AlertDescription>
          {t("admin.fh2Feed.underDevelopmentDesc")}
        </AlertDescription>
      </Alert>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Plane className="h-4 w-4 text-primary" />
            FlightHub 2 — Third-Party Airspace Data (pull)
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {t("admin.fh2Feed.description")}
          </p>
        </div>
        <Badge variant={enabled ? "default" : "secondary"}>
          {enabled ? t("admin.common.active") : t("admin.common.deactivated")}
        </Badge>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>{t("admin.fh2Feed.howToConfigure")}</AlertTitle>
        <AlertDescription className="text-xs space-y-1">
          <div>{t("admin.fh2Feed.step1")}</div>
          <div dangerouslySetInnerHTML={{ __html: t("admin.fh2Feed.step2") }} />
          <div dangerouslySetInnerHTML={{ __html: t("admin.fh2Feed.step3") }} />
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <Label className="text-xs">{t("admin.fh2Feed.serviceProviderUrl")}</Label>
        <div className="flex gap-2">
          <Input value={feedUrl} readOnly className="font-mono text-xs" />
          <Button variant="outline" size="icon" onClick={() => copy(feedUrl, "URL")}>
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">{t("admin.fh2Feed.apiKey")}</Label>
        {showKey ? (
          <Alert>
            <AlertTitle>{t("admin.fh2Feed.shownOnceOnly")}</AlertTitle>
            <AlertDescription className="space-y-2">
              <code className="block break-all rounded bg-muted p-2 text-xs">
                {showKey}
              </code>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => copy(showKey, "Nøkkel")}>
                  <Copy className="h-3 w-3 mr-1" /> {t("admin.common.copy")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowKey(null)}>
                  {t("admin.common.close")}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              value={
                keyPrefix
                  ? `${keyPrefix}••••••••••••••••••••••••••••••••••`
                  : t("admin.fh2Feed.noKey")
              }
              readOnly
              className="font-mono text-xs"
            />
            <Button onClick={rotate} disabled={rotating} variant="outline" size="sm">
              {rotating ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3 mr-1" />
              )}
              {keyPrefix ? t("admin.common.rotate") : t("admin.common.generate")}
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between rounded-md border border-border/50 p-3">
        <div>
          <Label className="text-sm">{t("admin.fh2Feed.enableFeed")}</Label>
          <p className="text-xs text-muted-foreground">
            {t("admin.fh2Feed.enableFeedDesc")}
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={toggle} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">{t("admin.fh2Feed.last20Requests")}</Label>
          <span className="text-xs text-muted-foreground">
            {lastRequestAt
              ? t("admin.fh2Feed.lastAt", { time: new Date(lastRequestAt).toLocaleString("no-NO") })
              : t("admin.fh2Feed.noneYet")}
          </span>
        </div>
        <div className="rounded-md border border-border/50 overflow-hidden">
          {loading ? (
            <div className="p-3 text-center text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin inline mr-1" /> {t("admin.common.loadingEllipsis")}
            </div>
          ) : logs.length === 0 ? (
            <div className="p-3 text-center text-xs text-muted-foreground">
              {t("admin.fh2Feed.noRequestsLogged")}
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2">{t("admin.fh2Feed.colTime")}</th>
                  <th className="text-left p-2">{t("admin.fh2Feed.colMethod")}</th>
                  <th className="text-left p-2">{t("admin.fh2Feed.colPath")}</th>
                  <th className="text-left p-2">{t("admin.fh2Feed.colQuery")}</th>
                  <th className="text-left p-2">{t("admin.fh2Feed.colStatus")}</th>
                  <th className="text-left p-2">{t("admin.fh2Feed.colKey")}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-t border-border/50 hover:bg-muted/30">
                    <td className="p-2 whitespace-nowrap">
                      {new Date(l.created_at).toLocaleTimeString("no-NO")}
                    </td>
                    <td className="p-2 font-mono">{l.method}</td>
                    <td className="p-2 font-mono break-all">{l.path}</td>
                    <td className="p-2 font-mono break-all text-muted-foreground">
                      {l.query ?? "—"}
                    </td>
                    <td className="p-2">
                      <Badge
                        variant={
                          l.status_returned && l.status_returned < 300
                            ? "default"
                            : "destructive"
                        }
                      >
                        {l.status_returned ?? "?"}
                      </Badge>
                    </td>
                    <td className="p-2">{l.matched_key ? "✓" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground">
          {t("admin.fh2Feed.logFooter")}
        </p>
      </div>
    </div>
  );
};
