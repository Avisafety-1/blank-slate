import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export interface SendMessagePayload {
  recipient_ids: string[];
  subject: string;
  body: string;
  parent_id?: string | null;
  severity?: "critical" | "warning" | "info";
  channels?: { email?: boolean; sms?: boolean };
}

export function useSendMessage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SendMessagePayload) => {
      const { data, error } = await supabase.functions.invoke("send-message", { body: payload });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (data: any) => {
      const ok = (data?.results ?? []).filter((r: any) => r.ok).length;
      toast.success(t("inbox.compose.sent", { count: ok, defaultValue: `Sent to ${ok} recipient(s)` }));
      qc.invalidateQueries({ queryKey: ["inbox"] });
      qc.invalidateQueries({ queryKey: ["inbox-unread-count"] });
      qc.invalidateQueries({ queryKey: ["inbox-thread"] });
    },
    onError: (err: any) => {
      toast.error(err?.message ?? "Failed to send message");
    },
  });
}
