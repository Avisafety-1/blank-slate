import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10 MB
export const ATTACHMENT_BUCKET = "message-attachments";

export interface MessageAttachment {
  id: string;
  message_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  file_size: number | null;
  url: string | null;
}

const sanitize = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .slice(-120);

export function formatFileSize(bytes?: number | null) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Uploads files for a message and registers them in the attachments table. */
export async function uploadMessageAttachments(messageId: string, files: File[]) {
  if (!files.length) return;
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) throw new Error("not_authenticated");

  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_SIZE) throw new Error(`too_large:${file.name}`);
    const path = `${messageId}/${Date.now()}-${sanitize(file.name)}`;
    const { error: upErr } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (upErr) throw new Error(upErr.message);

    const { error: rowErr } = await supabase.from("internal_message_attachments").insert({
      message_id: messageId,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      file_size: file.size,
      uploaded_by: userId,
    });
    if (rowErr) throw new Error(rowErr.message);
  }
}

/** Attachments for all messages in a thread, with signed URLs. */
export function useMessageAttachments(messageIds: string[]) {
  const key = [...messageIds].sort().join(",");
  return useQuery({
    queryKey: ["inbox-attachments", key],
    enabled: messageIds.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<MessageAttachment[]> => {
      const { data, error } = await supabase
        .from("internal_message_attachments")
        .select("id, message_id, storage_path, file_name, mime_type, file_size")
        .in("message_id", messageIds)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const rows = data ?? [];
      if (!rows.length) return [];

      const { data: signed } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .createSignedUrls(rows.map((r) => r.storage_path), 3600);
      const urlMap = new Map((signed ?? []).map((s) => [s.path ?? "", s.signedUrl]));

      return rows.map((r) => ({ ...r, url: urlMap.get(r.storage_path) ?? null }));
    },
  });
}

export function useInvalidateAttachments() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["inbox-attachments"] });
}
