import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { X, Send, Search, Loader2, Megaphone, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useRecipientsList,
  useFilteredRecipients,
  useServerRecipientSearch,
  type RecipientOption,
} from "./hooks/useSearchRecipients";
import { useBroadcastCompanies, useBroadcastAudience } from "./hooks/useBroadcast";
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

type Mode = "people" | "broadcast";

export const ComposeMessageDialog = ({ open, onOpenChange, prefill }: Props) => {
  const { t } = useTranslation();
  const { isAdmin, isSuperAdmin, companyName } = useAuth();
  const canUseExternalChannels = !!(isAdmin || isSuperAdmin);
  const canBroadcast = !!isSuperAdmin && (companyName ?? "").trim().toLowerCase() === "avisafe";

  const [mode, setMode] = useState<Mode>("people");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<RecipientOption[]>(prefill?.recipients ?? []);
  const [subject, setSubject] = useState(prefill?.subject ?? "");
  const [body, setBody] = useState("");
  const [emailChannel, setEmailChannel] = useState(false);
  const [smsChannel, setSmsChannel] = useState(false);
  const [audienceMode, setAudienceMode] = useState<"all" | "companies">("all");
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [companyQuery, setCompanyQuery] = useState("");
  const [confirming, setConfirming] = useState(false);

  const lockRecipients = !!prefill?.lockRecipients;
  const isReply = !!prefill?.parent_id;
  const broadcastMode = canBroadcast && mode === "broadcast" && !isReply && !lockRecipients;

  const { data: allRecipients = [], isFetching: isLoadingList } = useRecipientsList(
    open && !lockRecipients && !broadcastMode,
  );
  const localMatches = useFilteredRecipients(allRecipients, query);
  const needsServerSearch =
    !lockRecipients && !broadcastMode && query.trim().length >= 2 && localMatches.length === 0 && allRecipients.length >= 30;
  const { data: serverResults = [], isFetching: isSearching } = useServerRecipientSearch(query, needsServerSearch);
  const isFetching = isLoadingList || isSearching;
  const results = needsServerSearch ? serverResults : localMatches;

  const filteredResults = useMemo(
    () => results.filter((r) => !selected.some((s) => s.id === r.id)).slice(0, 50),
    [results, selected],
  );

  const { data: companies = [], isFetching: loadingCompanies } = useBroadcastCompanies(open && broadcastMode);
  const filteredCompanies = useMemo(() => {
    const q = companyQuery.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => (c.navn ?? "").toLowerCase().includes(q));
  }, [companies, companyQuery]);

  const { data: audience = [], isFetching: loadingAudience } = useBroadcastAudience(
    broadcastMode ? audienceMode : null,
    companyIds,
    open && broadcastMode,
  );

  const send = useSendMessage();

  const emailCount = audience.filter((a) => !!a.email).length;

  const reset = () => {
    setMode("people");
    setQuery("");
    setSelected(prefill?.recipients ?? []);
    setSubject(prefill?.subject ?? "");
    setBody("");
    setEmailChannel(false);
    setSmsChannel(false);
    setAudienceMode("all");
    setCompanyIds([]);
    setCompanyQuery("");
    setConfirming(false);
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const doSend = async () => {
    await send.mutateAsync({
      recipient_ids: broadcastMode ? [] : selected.map((s) => s.id),
      audience: broadcastMode
        ? { mode: audienceMode, company_ids: audienceMode === "companies" ? companyIds : undefined }
        : undefined,
      subject: subject.trim(),
      body: body.trim(),
      parent_id: prefill?.parent_id ?? null,
      channels: canUseExternalChannels ? { email: emailChannel, sms: smsChannel } : undefined,
    });
    handleClose(false);
  };

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) return;
    if (broadcastMode) {
      if (audience.length === 0) return;
      if (!confirming) {
        setConfirming(true);
        return;
      }
      await doSend();
      return;
    }
    if (!isReply && selected.length === 0) return;
    await doSend();
  };

  const sendDisabled =
    send.isPending ||
    !subject.trim() ||
    !body.trim() ||
    (broadcastMode ? audience.length === 0 || loadingAudience : !isReply && selected.length === 0);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg w-[calc(100vw-1rem)] p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isReply ? t("inbox.compose.replyTitle", "Reply") : t("inbox.compose.newTitle", "New message")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {canBroadcast && !isReply && !lockRecipients && (
            <Tabs
              value={mode}
              onValueChange={(v) => {
                setMode(v as Mode);
                setConfirming(false);
              }}
            >
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="people" className="text-xs sm:text-sm">
                  {t("inbox.compose.modePeople", "Select people")}
                </TabsTrigger>
                <TabsTrigger value="broadcast" className="text-xs sm:text-sm">
                  <Megaphone className="w-3.5 h-3.5 mr-1" />
                  {t("inbox.compose.modeBroadcast", "Broadcast")}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          {/* Broadcast targeting */}
          {broadcastMode ? (
            <div className="space-y-3">
              <Label>{t("inbox.compose.audience", "Audience")}</Label>
              <Tabs
                value={audienceMode}
                onValueChange={(v) => {
                  setAudienceMode(v as "all" | "companies");
                  setConfirming(false);
                }}
              >
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="all" className="text-xs sm:text-sm">
                    {t("inbox.compose.audienceAll", "All users")}
                  </TabsTrigger>
                  <TabsTrigger value="companies" className="text-xs sm:text-sm">
                    {t("inbox.compose.audienceCompanies", "Select companies")}
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {audienceMode === "companies" && (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={companyQuery}
                      onChange={(e) => setCompanyQuery(e.target.value)}
                      placeholder={t("inbox.compose.searchCompanies", "Search companies…")}
                      className="pl-9"
                    />
                    {loadingCompanies && (
                      <Loader2 className="absolute right-2.5 top-2.5 w-4 h-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  <div className="border rounded-md max-h-48 overflow-y-auto divide-y">
                    {filteredCompanies.map((c) => (
                      <label
                        key={c.id}
                        className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={companyIds.includes(c.id)}
                          onCheckedChange={(v) => {
                            setConfirming(false);
                            setCompanyIds((prev) =>
                              v ? [...prev, c.id] : prev.filter((id) => id !== c.id),
                            );
                          }}
                        />
                        <span className="flex-1 truncate">{c.navn}</span>
                        <span className="text-xs text-muted-foreground">{c.user_count}</span>
                      </label>
                    ))}
                    {filteredCompanies.length === 0 && !loadingCompanies && (
                      <div className="p-3 text-sm text-muted-foreground">
                        {t("inbox.compose.noResults", "No matches")}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                {loadingAudience
                  ? t("common.loading")
                  : t("inbox.compose.audienceCount", {
                      count: audience.length,
                      defaultValue: "{{count}} recipients",
                    })}
              </p>
            </div>
          ) : (
            /* Recipients */
            <div className="space-y-2">
              <Label>{t("inbox.compose.to", "To")}</Label>
              {selected.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selected.map((r) => (
                    <Badge key={r.id} variant="secondary" className="pl-2 pr-1 py-1 text-xs max-w-full">
                      <span className="mr-1 truncate">
                        {r.full_name || r.email}
                        {r.email && r.full_name && (
                          <span className="ml-1 text-muted-foreground">· {r.email}</span>
                        )}
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
                    {isFetching && (
                      <Loader2 className="absolute right-2.5 top-2.5 w-4 h-4 animate-spin text-muted-foreground" />
                    )}
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
                          className={cn("w-full text-left px-3 py-2 hover:bg-muted transition text-sm")}
                        >
                          <div className="font-medium truncate">{r.full_name || r.email}</div>
                          <div className="text-xs text-muted-foreground truncate">
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
          )}

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
                  <Checkbox
                    checked={emailChannel}
                    onCheckedChange={(v) => {
                      setEmailChannel(!!v);
                      setConfirming(false);
                    }}
                  />
                  {t("inbox.compose.email", "Email")}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={smsChannel}
                    onCheckedChange={(v) => {
                      setSmsChannel(!!v);
                      setConfirming(false);
                    }}
                  />
                  {t("inbox.compose.sms", "SMS")}
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("inbox.compose.channelsHint", "Inbox delivery is always included.")}
              </p>
            </div>
          )}

          {/* Broadcast confirmation */}
          {broadcastMode && confirming && (
            <div className="rounded-md border border-status-yellow/40 bg-status-yellow/10 p-3 text-sm space-y-1">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="w-4 h-4 text-status-yellow" />
                {t("inbox.compose.confirmTitle", "Confirm broadcast")}
              </div>
              <p className="text-xs">
                {t("inbox.compose.confirmInbox", {
                  count: audience.length,
                  defaultValue: "Inbox: {{count}} recipients",
                })}
                {emailChannel && (
                  <>
                    {" · "}
                    {t("inbox.compose.confirmEmail", {
                      count: emailCount,
                      defaultValue: "Email: {{count}}",
                    })}
                  </>
                )}
                {smsChannel && (
                  <>
                    {" · "}
                    {t("inbox.compose.confirmSms", "SMS to everyone with a phone number")}
                  </>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("inbox.compose.confirmHint", "Press Send again to confirm.")}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 mt-4">
          <Button variant="outline" onClick={() => handleClose(false)}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button onClick={handleSend} disabled={sendDisabled}>
            {send.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            {broadcastMode && !confirming
              ? t("inbox.compose.review", "Review & send")
              : t("inbox.compose.send", "Send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
