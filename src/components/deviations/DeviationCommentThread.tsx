import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send } from "lucide-react";
import { format } from "date-fns";
import { nb, enUS } from "date-fns/locale";
import { toast } from "sonner";

interface Props {
  deviationId: string;
  companyId: string;
  onCountChange?: (count: number) => void;
}

interface CommentRow {
  id: string;
  comment_text: string;
  created_at: string;
  author_id: string | null;
  author_name?: string | null;
}

export const DeviationCommentThread = ({ deviationId, companyId, onCountChange }: Props) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const dateLocale = i18n.language === "en" ? enUS : nb;

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("deviation_report_comments")
      .select("id, comment_text, created_at, author_id")
      .eq("deviation_id", deviationId)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[DeviationComments] load error", error);
      setLoading(false);
      return;
    }
    const rows: CommentRow[] = data || [];
    const ids = Array.from(new Set(rows.map((r) => r.author_id).filter(Boolean) as string[]));
    let names: Record<string, string> = {};
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      names = Object.fromEntries((profs || []).map((p: any) => [p.id, p.full_name]));
    }
    const withNames = rows.map((r) => ({ ...r, author_name: r.author_id ? names[r.author_id] : null }));
    setComments(withNames);
    onCountChange?.(withNames.length);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviationId]);

  const submit = async () => {
    if (!text.trim() || !user) return;
    setSaving(true);
    const { error } = await (supabase as any).from("deviation_report_comments").insert({
      deviation_id: deviationId,
      company_id: companyId,
      author_id: user.id,
      comment_text: text.trim(),
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setText("");
    load();
  };

  return (
    <div className="space-y-3">
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t("common.loading")}
        </div>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">{t("deviations.comments.empty")}</p>
      ) : (
        <div className="space-y-2">
          {comments.map((c) => (
            <div key={c.id} className="rounded-md bg-muted/40 border border-border/50 p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-1">
                <span className="font-medium text-foreground">
                  {c.author_name || t("deviations.card.unknownPilot")}
                </span>
                <span>{format(new Date(c.created_at), "dd.MM.yyyy HH:mm", { locale: dateLocale })}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{c.comment_text}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("deviations.comments.placeholder")}
          rows={2}
          className="flex-1"
        />
        <Button onClick={submit} disabled={saving || !text.trim()} className="sm:self-end gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {t("deviations.comments.send")}
        </Button>
      </div>
    </div>
  );
};
