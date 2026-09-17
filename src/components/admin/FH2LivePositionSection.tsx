import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Copy, Eye, EyeOff, Info, Loader2, RefreshCw, Satellite, Users } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

interface MqttCredentials {
  username: string;
  password: string;
  enabled: boolean;
  created_at: string | null;
  updated_at: string | null;
  owner_company_name: string | null;
  shared_company_names: string[];
  mqtt_host: string | null;
  mqtt_port: number | null;
  mqtt_protocol: string | null;
}

export const FH2LivePositionSection = () => {
  const { t } = useTranslation();
  const { companyId } = useAuth();

  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [creds, setCreds] = useState<MqttCredentials | null>(null);

  const call = async (action: "get" | "regenerate") => {
    const { data, error } = await supabase.functions.invoke("mqtt-credentials", {
      body: { action },
    });
    if (error) throw error;
    if ((data as any)?.error) throw new Error((data as any).error);
    return data as MqttCredentials;
  };

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      setCreds(await call("get"));
    } catch (e: any) {
      toast.error(t("admin.fh2LivePosition.errorLoading", { message: e?.message ?? e }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const copy = (value: string, label: string) => {
    navigator.clipboard.writeText(value);
    toast.success(t("admin.fh2Feed.copiedLabel", { label }));
  };

  const handleRegenerate = async () => {
    setConfirmOpen(false);
    setRegenerating(true);
    try {
      setCreds(await call("regenerate"));
      setShowPassword(true);
      toast.success(t("admin.fh2LivePosition.regenerated"));
    } catch (e: any) {
      toast.error(t("admin.fh2LivePosition.errorRegenerating", { message: e?.message ?? e }));
    } finally {
      setRegenerating(false);
    }
  };

  const sharedWith = (creds?.shared_company_names ?? []).filter(
    (name) => name !== creds?.owner_company_name,
  );

  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-card/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-base font-semibold flex items-center gap-2">
            <Satellite className="h-4 w-4 text-primary" />
            {t("admin.fh2LivePosition.title")}
          </h4>
          <p className="text-sm text-muted-foreground mt-1">
            {t("admin.fh2LivePosition.description")}
          </p>
        </div>
        {creds?.enabled && (
          <Badge variant="default">{t("admin.common.active")}</Badge>
        )}
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>{t("admin.fh2LivePosition.howToTitle")}</AlertTitle>
        <AlertDescription>{t("admin.fh2LivePosition.howToDesc")}</AlertDescription>
      </Alert>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : creds ? (
        <>
          {creds.mqtt_host && (
            <div className="space-y-2">
              <Label>{t("admin.fh2LivePosition.hostLabel")}</Label>
              <div className="flex gap-2">
                <Input readOnly value={creds.mqtt_host} className="font-mono text-xs" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => copy(creds.mqtt_host!, t("admin.fh2LivePosition.hostLabel"))}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("admin.fh2LivePosition.portLabel")}</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={String(creds.mqtt_port ?? 1883)}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    copy(String(creds.mqtt_port ?? 1883), t("admin.fh2LivePosition.portLabel"))
                  }
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("admin.fh2LivePosition.protocolLabel")}</Label>
              <Input
                readOnly
                value={creds.mqtt_protocol ?? "TCP"}
                className="font-mono text-xs"
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {t("admin.fh2LivePosition.portHint")}
          </p>


          <div className="space-y-2">
            <Label>{t("admin.fh2LivePosition.usernameLabel")}</Label>
            <div className="flex gap-2">
              <Input readOnly value={creds.username} className="font-mono text-xs" />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => copy(creds.username, t("admin.fh2LivePosition.usernameLabel"))}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("admin.fh2LivePosition.passwordLabel")}</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                type={showPassword ? "text" : "password"}
                value={creds.password}
                className="font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setShowPassword((v) => !v)}
                title={t(showPassword ? "admin.fh2LivePosition.hide" : "admin.fh2LivePosition.show")}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => copy(creds.password, t("admin.fh2LivePosition.passwordLabel"))}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {sharedWith.length > 0 && (
            <Alert className="border-amber-500/40 bg-amber-500/10">
              <Users className="h-4 w-4" />
              <AlertTitle>{t("admin.fh2LivePosition.sharedTitle")}</AlertTitle>
              <AlertDescription>
                {t("admin.fh2LivePosition.sharedDesc", {
                  companies: sharedWith.join(", "),
                })}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-xs text-muted-foreground">
              {creds.updated_at
                ? t("admin.fh2LivePosition.lastChanged", {
                    date: new Date(creds.updated_at).toLocaleString("nb-NO"),
                  })
                : ""}
            </p>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(true)}
              disabled={regenerating}
            >
              {regenerating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              {t("admin.fh2LivePosition.regenerate")}
            </Button>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("admin.fh2LivePosition.noCredentials")}
        </p>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("admin.fh2LivePosition.confirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("admin.fh2LivePosition.confirmDesc")}
              {sharedWith.length > 0 && (
                <>
                  {" "}
                  {t("admin.fh2LivePosition.confirmSharedDesc", {
                    companies: sharedWith.join(", "),
                  })}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("admin.common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRegenerate}>
              {t("admin.fh2LivePosition.regenerate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
