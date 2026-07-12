import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Copy,
  RefreshCw,
  Save,
  Loader2,
  Radio,
  Info,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const WEBHOOK_FN = "flighthub2-airspace-webhook";
const TOKEN_MASK = "••••••••••••••••••••••••••••••••";

function generateToken(length = 48): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_!@#$%^*";
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[arr[i] % alphabet.length];
  return out;
}

export const FH2AirspaceWebhookSection = () => {
  const { t } = useTranslation();
  const { companyId } = useAuth();
  const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID as
    | string
    | undefined;
  const webhookUrl = projectRef
    ? `https://${projectRef}.functions.supabase.co/${WEBHOOK_FN}`
    : "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [safeskyForward, setSafeskyForward] = useState(false);
  const [orgId, setOrgId] = useState("");
  const [token, setToken] = useState("");
  const [hasSavedToken, setHasSavedToken] = useState(false);
  const [lastReceivedAt, setLastReceivedAt] = useState<string | null>(null);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    const { data } = await supabase
      .from("flighthub2_webhook_config")
      .select("flight_hub_organization_id, enabled, safesky_forward, last_received_at, token_encrypted")
      .eq("company_id", companyId)
      .maybeSingle();
    if (data) {
      setOrgId(data.flight_hub_organization_id ?? "");
      setEnabled(!!data.enabled);
      setSafeskyForward(!!(data as any).safesky_forward);
      setLastReceivedAt(data.last_received_at ?? null);
      setHasSavedToken(!!data.token_encrypted);
      setToken(data.token_encrypted ? TOKEN_MASK : "");
    } else {
      setOrgId("");
      setEnabled(false);
      setSafeskyForward(false);
      setLastReceivedAt(null);
      setHasSavedToken(false);
      setToken("");
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const copy = (val: string, label: string) => {
    navigator.clipboard.writeText(val);
    toast.success(t("admin.fh2Feed.copiedLabel", { label }));
  };

  const handleGenerate = () => {
    setToken(generateToken(48));
    setHasSavedToken(false);
    toast.info(t("admin.fh2Webhook.tokenGeneratedRemember"));
  };

  const handleSave = async () => {
    if (!companyId) return;
    const tokenIsNew = token && token !== TOKEN_MASK;
    if (!hasSavedToken && !tokenIsNew) {
      toast.error(t("admin.fh2Webhook.generateTokenFirst"));
      return;
    }
    setSaving(true);
    try {
      if (tokenIsNew) {
        const { data, error } = await supabase.functions.invoke(
          "flighthub2-airspace-webhook-config",
          {
            body: {
              action: "save",
              token,
              enabled,
              safesky_forward: safeskyForward,
            },
          },
        );
        if (error) throw error;
        if ((data as any)?.flight_hub_organization_id) {
          setOrgId((data as any).flight_hub_organization_id);
        }
      } else {
        const { error } = await supabase
          .from("flighthub2_webhook_config")
          .update({
            enabled,
            safesky_forward: safeskyForward,
          } as any)
          .eq("company_id", companyId);
        if (error) throw error;
      }
      toast.success(t("admin.fh2Webhook.configSaved"));
      await load();
    } catch (e: any) {
      toast.error(t("admin.fh2Webhook.errorSaving", { message: e?.message ?? e }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative space-y-4 rounded-lg border-2 border-destructive/50 bg-destructive/10 p-4">
      <Alert variant="destructive" className="bg-destructive/20 border-destructive">
        <AlertTitle className="font-bold uppercase tracking-wide">{t("admin.fh2Feed.underDevelopment")}</AlertTitle>
        <AlertDescription>
          {t("admin.fh2Feed.underDevelopmentDesc")}
        </AlertDescription>
      </Alert>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-base font-semibold flex items-center gap-2">
            <Radio className="h-4 w-4 text-primary" />
            {t("admin.fh2Webhook.title")}
          </h4>
          <p className="text-sm text-muted-foreground mt-1">
            {t("admin.fh2Webhook.description")}
          </p>
        </div>
        {hasSavedToken && enabled && (
          <Badge variant="default" className="gap-1">
            <CheckCircle2 className="h-3 w-3" /> {t("admin.common.active")}
          </Badge>
        )}
      </div>

      <Alert className="bg-yellow-500/10 border-yellow-500/30 text-black">
        <Info className="h-4 w-4 text-black" />
        <AlertTitle className="text-black">{t("admin.fh2Webhook.dockOnlyTitle")}</AlertTitle>
        <AlertDescription className="text-black/80">
          {t("admin.fh2Webhook.dockOnlyDesc")}
        </AlertDescription>
      </Alert>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <Label>{t("admin.fh2Webhook.webhookUrl")}</Label>
            <div className="flex gap-2">
              <Input value={webhookUrl} readOnly className="font-mono text-xs" />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => copy(webhookUrl, t("admin.fh2Webhook.webhookUrl"))}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>




          <div className="space-y-2">
            <Label htmlFor="fh2-webhook-token">{t("admin.fh2Webhook.tokenLabel")}</Label>
            <div className="flex gap-2">
              <Input
                id="fh2-webhook-token"
                value={token}
                onChange={(e) => {
                  setToken(e.target.value);
                  if (e.target.value !== TOKEN_MASK) setHasSavedToken(false);
                }}
                placeholder={t("admin.fh2Webhook.tokenPlaceholder")}
                className="font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleGenerate}
                title={t("admin.fh2Webhook.generateNewToken")}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              {token && token !== TOKEN_MASK && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => copy(token, t("admin.fh2Webhook.tokenLabel"))}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("admin.fh2Webhook.copyTokenBeforeSave")}
            </p>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border/40 px-3 py-2">
            <div>
              <Label htmlFor="fh2-enabled" className="cursor-pointer">
                {t("admin.fh2Webhook.enableWebhook")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("admin.fh2Webhook.enableWebhookDesc")}
              </p>
            </div>
            <Switch
              id="fh2-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border/40 px-3 py-2">
            <div>
              <Label htmlFor="fh2-safesky" className="cursor-pointer">
                {t("admin.fh2Webhook.shareWithSafesky")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("admin.fh2Webhook.shareWithSafeskyDesc")}
              </p>
            </div>
            <Switch
              id="fh2-safesky"
              checked={safeskyForward}
              onCheckedChange={setSafeskyForward}
              disabled={!enabled}
            />
          </div>

          {lastReceivedAt && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>{t("admin.fh2Webhook.lastReceived")}</AlertTitle>
              <AlertDescription>
                {new Date(lastReceivedAt).toLocaleString("nb-NO")}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {t("admin.common.save")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};
