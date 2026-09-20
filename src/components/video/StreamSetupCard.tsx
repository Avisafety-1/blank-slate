import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import QRCode from "react-qr-code";
import { Copy, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface SetupResponse {
  has_key: boolean;
  key_visible: boolean;
  key_prefix: string | null;
  updated_at?: string | null;
  enabled: boolean;
  rtmp_url?: string;
  rtmp_url_plain?: string;
}

interface StreamSetupCardProps {
  droneId: string;
}

export function StreamSetupCard({ droneId }: StreamSetupCardProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [data, setData] = useState<SetupResponse | null>(null);

  const load = useCallback(
    async (action: "get" | "rotate") => {
      const setBusy = action === "rotate" ? setRotating : setLoading;
      setBusy(true);
      try {
        const { data: result, error } = await supabase.functions.invoke("live-video-setup", {
          body: { action, drone_id: droneId },
        });
        if (error) throw error;
        setData(result as SetupResponse);
      } catch {
        toast.error(t("liveVideo.setupError"));
      } finally {
        setBusy(false);
      }
    },
    [droneId, t],
  );

  useEffect(() => {
    void load("get");
  }, [load]);

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t("liveVideo.copied"));
    } catch {
      toast.error(t("liveVideo.copyFailed"));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {data?.key_visible && data.rtmp_url ? (
        <div className="space-y-3">
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              {t("liveVideo.serverAddress")}
            </p>
            <div className="flex items-start gap-2">
              <code className="min-w-0 flex-1 break-all text-xs">{data.rtmp_url}</code>
              <Button size="icon" variant="ghost" onClick={() => copy(data.rtmp_url!)}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex justify-center rounded-lg bg-background p-4">
            <QRCode value={data.rtmp_url} size={144} />
          </div>
          <p className="text-xs text-muted-foreground">{t("liveVideo.keyOnceWarning")}</p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("liveVideo.keyHidden")}</p>
      )}

      <div className="space-y-2 rounded-lg border p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">{t("liveVideo.howToPilot2Title")}</p>
        <p>{t("liveVideo.howToPilot2")}</p>
        <p className="pt-1 font-medium text-foreground">{t("liveVideo.howToFh2Title")}</p>
        <p>{t("liveVideo.howToFh2")}</p>
      </div>

      <Button
        variant="secondary"
        className="w-full"
        disabled={rotating}
        onClick={() => load("rotate")}
      >
        {rotating ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="mr-2 h-4 w-4" />
        )}
        {t("liveVideo.rotateKey")}
      </Button>
    </div>
  );
}

export default StreamSetupCard;
