import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export interface SendReminderPayload {
  recipient_ids: string[];
  subject: string;
  body: string;
  deep_link?: string | null;
  finding_key?: string | null;
  severity?: "critical" | "warning" | "info";
  channels: { email: boolean; sms: boolean; inbox: boolean };
}

export function useSendReminder() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SendReminderPayload) => {
      const { data, error } = await supabase.functions.invoke("send-reminder", { body: payload });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      const results = data?.results ?? [];
      const ok = results.filter((r: any) => r.ok).length;
      toast.success(t("audit.reminder.sent", { count: ok }));
      qc.invalidateQueries({ queryKey: ["inbox"] });
      qc.invalidateQueries({ queryKey: ["inbox-unread-count"] });
    },
    onError: (e) => {
      toast.error(t("audit.reminder.failed"), { description: String((e as Error).message ?? e) });
    },
  });
}
