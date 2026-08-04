import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export interface SendMessagePayload {
  recipient_ids: string[];
  audience?: { mode: "all" | "companies"; company_ids?: string[] } | null;
  subject: string;
  body: string;
  parent_id?: string | null;
  severity?: "critical" | "warning" | "info";
  channels?: { email?: boolean; sms?: boolean };
  attachment_count?: number;
}


export function useSendMessage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SendMessagePayload) => {
      const { data, error } = await supabase.functions.invoke("send-message", { body: payload });
      if (error) {
        // Surface the real server error instead of the generic non-2xx message
        let details = error.message;
        const ctx = (error as unknown as { context?: Response }).context;
        if (ctx && typeof ctx.text === "function") {
          try {
            const raw = await ctx.text();
            const parsed = JSON.parse(raw);
            details = parsed?.error ?? raw ?? details;
          } catch {
            /* keep generic message */
          }
        }
        throw new Error(details);
      }
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
