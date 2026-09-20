import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { WhepPlayer, type WhepStatus } from "./WhepPlayer";
import { StreamSetupCard } from "./StreamSetupCard";

interface LiveVideoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  droneId: string;
  droneName: string;
  /** Vis oppsettsfanen (kun administratorer) */
  canManage?: boolean;
}

export function LiveVideoDialog({
  open,
  onOpenChange,
  droneId,
  droneName,
  canManage = false,
}: LiveVideoDialogProps) {
  const { t } = useTranslation();
  const [streamPath, setStreamPath] = useState<string | null>(null);

  const getWhepUrl = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("live-video-access", {
      body: { action: "watch", drone_id: droneId },
    });
    if (error || !data?.whep_url) return null;
    setStreamPath(data.stream_path ?? null);
    return data.whep_url as string;
  }, [droneId]);

  const handleStatus = useCallback(
    (status: WhepStatus) => {
      if (status === "gone" && streamPath) {
        void supabase.functions.invoke("live-video-access", {
          body: { action: "ended", stream_path: streamPath },
        });
      }
    },
    [streamPath],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto p-3 sm:p-6 [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>{t("liveVideo.title", { drone: droneName })}</DialogTitle>
        </DialogHeader>

        {canManage ? (
          <Tabs defaultValue="watch">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="watch">{t("liveVideo.tabWatch")}</TabsTrigger>
              <TabsTrigger value="setup">{t("liveVideo.tabSetup")}</TabsTrigger>
            </TabsList>
            <TabsContent value="watch" className="pt-3">
              {open && (
                <WhepPlayer
                  getWhepUrl={getWhepUrl}
                  onStatusChange={handleStatus}
                  className="aspect-video"
                />
              )}
            </TabsContent>
            <TabsContent value="setup" className="pt-3">
              <StreamSetupCard droneId={droneId} />
            </TabsContent>
          </Tabs>
        ) : (
          open && (
            <WhepPlayer
              getWhepUrl={getWhepUrl}
              onStatusChange={handleStatus}
              className="aspect-video"
            />
          )
        )}
      </DialogContent>
    </Dialog>
  );
}

export default LiveVideoDialog;
