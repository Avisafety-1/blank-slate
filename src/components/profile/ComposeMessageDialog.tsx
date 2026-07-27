import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { X, Send, Search, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useRecipientsList,
  useFilteredRecipients,
  useServerRecipientSearch,
  type RecipientOption,
} from "./hooks/useSearchRecipients";
import { useSendMessage } from "./hooks/useSendMessage";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prefill?: {
    parent_id?: string | null;
    recipients?: RecipientOption[];
    subject?: string;
    lockRecipients?: boolean;
  };
}

export const ComposeMessageDialog = ({ open, onOpenChange, prefill }: Props) => {
  const { t } = useTranslation();
  const { isAdmin, isSuperAdmin } = useAuth();
  const canUseExternalChannels = !!(isAdmin || isSuperAdmin);

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<RecipientOption[]>(prefill?.recipients ?? []);
  const [subject, setSubject] = useState(prefill?.subject ?? "");
  const [body, setBody] = useState("");
  const [emailChannel, setEmailChannel] = useState(false);
  const [smsChannel, setSmsChannel] = useState(false);

  const lockRecipients = !!prefill?.lockRecipients;
  const isReply = !!prefill?.parent_id;

  const { data: allRecipients = [], isFetching: isLoadingList } = useRecipientsList(
    open && !lockRecipients,
  );
  const localMatches = useFilteredRecipients(allRecipients, query);
  // If prefetched list is at server cap (30) and local yields nothing, ask server.
  const needsServerSearch =
    !lockRecipients && query.trim().length >= 2 && localMatches.length === 0 && allRecipients.length >= 30;
  const { data: serverResults = [], isFetching: isSearching } = useServerRecipientSearch(
    query,
    needsServerSearch,
  );
  const isFetching = isLoadingList || isSearching;
  const results = needsServerSearch ? serverResults : localMatches;

  const filteredResults = useMemo(
    () => results.filter((r) => !selected.some((s) => s.id === r.id)).slice(0, 30),
    [results, selected],
  );
  const send = useSendMessage();




  const reset = () => {
    setQuery("");
    setSelected(prefill?.recipients ?? []);
    setSubject(prefill?.subject ?? "");
    setBody("");
    setEmailChannel(false);
    setSmsChannel(false);
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleSend = async () => {
    if (!subject.trim() || !body.trim() || (!isReply && selected.length === 0)) return;
    await send.mutateAsync({
      recipient_ids: selected.map((s) => s.id),
      subject: subject.trim(),
      body: body.trim(),
      parent_id: prefill?.parent_id ?? null,
      channels: canUseExternalChannels ? { email: emailChannel, sms: smsChannel } : undefined,
    });
    handleClose(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg w-[calc(100vw-1rem)] p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isReply ? t("inbox.compose.replyTitle", "Reply") : t("inbox.compose.newTitle", "New message")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Recipients */}
          <div className="space-y-2">
            <Label>{t("inbox.compose.to", "To")}</Label>
            {selected.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selected.map((r) => (
                  <Badge key={r.id} variant="secondary" className="pl-2 pr-1 py-1 text-xs">
                    <span className="mr-1">
                      {r.full_name || r.email}
                      {r.company_name && (
                        <span className="ml-1 text-muted-foreground">· {r.company_name}</span>
                      )}
                    </span>
                    {!lockRecipients && (
                      <button
                        type="button"
                        onClick={() => setSelected((prev) => prev.filter((s) => s.id !== r.id))}
                        className="hover:bg-muted rounded p-0.5"
                        aria-label="Remove"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </Badge>
                ))}
              </div>
            )}
            {!lockRecipients && (
              <>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("inbox.compose.searchPlaceholder", "Search people…")}
                    className="pl-9"
                  />
                  {isFetching && <Loader2 className="absolute right-2.5 top-2.5 w-4 h-4 animate-spin text-muted-foreground" />}
                </div>
                {query.trim().length > 0 && (
                  <div className="border rounded-md max-h-48 overflow-y-auto divide-y">
                    {filteredResults.length === 0 && !isFetching && (
                      <div className="p-3 text-sm text-muted-foreground">
                        {t("inbox.compose.noResults", "No matches")}
                      </div>
                    )}
                    {filteredResults.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          setSelected((prev) => [...prev, r]);
                          setQuery("");
                        }}
                        className={cn(
                          "w-full text-left px-3 py-2 hover:bg-muted transition text-sm",
                        )}
                      >
                        <div className="font-medium">{r.full_name || r.email}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.email}
                          {r.company_name && <> · {r.company_name}</>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Subject */}
          <div className="space-y-2">
            <Label>{t("inbox.compose.subject", "Subject")}</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
          </div>

          {/* Body */}
          <div className="space-y-2">
            <Label>{t("inbox.compose.body", "Message")}</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} maxLength={4000} />
          </div>

          {/* Channels (admin/superadmin only) */}
          {canUseExternalChannels && (
            <div className="space-y-2">
              <Label>{t("inbox.compose.channels", "Also deliver via")}</Label>
              <div className="flex flex-col sm:flex-row gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={emailChannel} onCheckedChange={(v) => setEmailChannel(!!v)} />
                  {t("inbox.compose.email", "Email")}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={smsChannel} onCheckedChange={(v) => setSmsChannel(!!v)} />
                  {t("inbox.compose.sms", "SMS")}
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("inbox.compose.channelsHint", "Inbox delivery is always included.")}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 mt-4">
          <Button variant="outline" onClick={() => handleClose(false)}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            onClick={handleSend}
            disabled={
              send.isPending ||
              !subject.trim() ||
              !body.trim() ||
              (!isReply && selected.length === 0)
            }
          >
            {send.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            {t("inbox.compose.send", "Send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
