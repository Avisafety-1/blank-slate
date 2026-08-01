import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const REACTION_EMOJIS = ["👍", "❤️", "😂", "🎉", "✅", "❓"];

export interface MessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
}

export function useMessageReactions(messageIds: string[]) {
  const key = [...messageIds].sort().join(",");
  return useQuery({
    queryKey: ["message-reactions", key],
    enabled: messageIds.length > 0,
    staleTime: 0,
    queryFn: async (): Promise<MessageReaction[]> => {
      const { data, error } = await supabase
        .from("internal_message_reactions")
        .select("id, message_id, user_id, emoji")
        .in("message_id", messageIds);
      if (error) throw error;
      return (data ?? []) as MessageReaction[];
    },
  });
}

export function useToggleReaction() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      if (!user?.id) throw new Error("not_authenticated");
      const { data: existing } = await supabase
        .from("internal_message_reactions")
        .select("id")
        .eq("message_id", messageId)
        .eq("user_id", user.id)
        .eq("emoji", emoji)
        .maybeSingle();

      if (existing?.id) {
        const { error } = await supabase.from("internal_message_reactions").delete().eq("id", existing.id);
        if (error) throw error;
        return { removed: true };
      }
      const { error } = await supabase
        .from("internal_message_reactions")
        .insert({ message_id: messageId, user_id: user.id, emoji });
      if (error) throw error;
      return { removed: false };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["message-reactions"] });
    },
  });
}
