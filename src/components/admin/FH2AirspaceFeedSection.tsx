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
      toast.error("Kunne ikke generere ny API-nøkkel");
      return;
    }
    setShowKey(data.api_key);
    toast.success("Ny API-nøkkel generert — kopier den nå");
    load();
  };

  const toggle = async (val: boolean) => {
    setEnabled(val);
    const { error } = await supabase.functions.invoke(
      "flighthub2-airspace-feed-config",
      { body: { action: "set_enabled", enabled: val } },
    );
    if (error) {
      toast.error("Kunne ikke oppdatere status");
      setEnabled(!val);
    }
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} kopiert`);
  };

  return (
    <div className="relative space-y-4 rounded-lg border-2 border-destructive/50 bg-destructive/10 p-4 backdrop-blur-sm">
      <Alert variant="destructive" className="bg-destructive/20 border-destructive">
        <AlertTitle className="font-bold uppercase tracking-wide">Under utvikling!</AlertTitle>
        <AlertDescription>
          Denne funksjonen er ikke produksjonsklar og kan endre seg eller slutte å virke uten varsel.
        </AlertDescription>
      </Alert>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Plane className="h-4 w-4 text-primary" />
            FlightHub 2 — Third-Party Airspace Data (pull)
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            DJI FlightHub 2 henter sivil flytrafikk fra dette endepunktet og
            viser den i FH2-kartet. Skill fra "Airspace Management" som er
            push-mottak.
          </p>
        </div>
        <Badge variant={enabled ? "default" : "secondary"}>
          {enabled ? "Aktiv" : "Deaktivert"}
        </Badge>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Slik konfigurerer du i FH2</AlertTitle>
        <AlertDescription className="text-xs space-y-1">
          <div>1. Generér en API-nøkkel under, kopier den.</div>
          <div>2. I FH2 → Data Management → Airspace Data Configuration:
            sett <b>Service provider URL</b> = URL under, og lim inn nøkkelen som <b>API Key</b>.</div>
          <div>3. Trykk <b>Verify</b> i FH2. Forespørsler vises i loggen nederst.</div>
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <Label className="text-xs">Service provider URL</Label>
        <div className="flex gap-2">
          <Input value={feedUrl} readOnly className="font-mono text-xs" />
          <Button variant="outline" size="icon" onClick={() => copy(feedUrl, "URL")}>
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">API-nøkkel</Label>
        {showKey ? (
          <Alert>
            <AlertTitle>Vises kun nå</AlertTitle>
            <AlertDescription className="space-y-2">
              <code className="block break-all rounded bg-muted p-2 text-xs">
                {showKey}
              </code>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => copy(showKey, "Nøkkel")}>
                  <Copy className="h-3 w-3 mr-1" /> Kopier
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowKey(null)}>
                  Lukk
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
                  : "Ingen nøkkel"
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
              {keyPrefix ? "Roter" : "Generér"}
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between rounded-md border border-border/50 p-3">
        <div>
          <Label className="text-sm">Aktiver feed</Label>
          <p className="text-xs text-muted-foreground">
            Når av: DJI får 401 selv med korrekt nøkkel.
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={toggle} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Siste 20 forespørsler fra DJI</Label>
          <span className="text-xs text-muted-foreground">
            {lastRequestAt
              ? `Sist: ${new Date(lastRequestAt).toLocaleString("no-NO")}`
              : "Ingen ennå"}
          </span>
        </div>
        <div className="rounded-md border border-border/50 overflow-hidden">
          {loading ? (
            <div className="p-3 text-center text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin inline mr-1" /> Laster…
            </div>
          ) : logs.length === 0 ? (
            <div className="p-3 text-center text-xs text-muted-foreground">
              Ingen requests logget ennå. Trykk <b>Verify</b> i FH2.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2">Tid</th>
                  <th className="text-left p-2">Metode</th>
                  <th className="text-left p-2">Path</th>
                  <th className="text-left p-2">Query</th>
                  <th className="text-left p-2">Status</th>
                  <th className="text-left p-2">Nøkkel</th>
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
          Loggen oppdateres hvert 10. sekund. Bruk denne til å se eksakt hva DJI
          sender (path, query-parametre, headers) før vi kobler på faktisk
          trafikk-data.
        </p>
      </div>
    </div>
  );
};
