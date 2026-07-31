import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { nb, enUS } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Inbox,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  Plus,
  Send,
  Loader2,
  Users,
  Megaphone,
  MessagesSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useInboxMessages, useMarkMessage, type InboxMessage, type MessageParty } from "./hooks/useInboxMessages";
import { useMessageThread } from "./hooks/useMessageThread";
import { useSendMessage } from "./hooks/useSendMessage";
import { ComposeMessageDialog } from "./ComposeMessageDialog";

const sevIcon = (s: InboxMessage["severity"]) => {
  if (s === "critical") return <AlertCircle className="w-4 h-4 text-status-red" />;
  if (s === "warning") return <AlertTriangle className="w-4 h-4 text-status-yellow" />;
  return <Info className="w-4 h-4 text-primary" />;
};

const sevClass = (s: InboxMessage["severity"]) =>
  s === "critical"
    ? "text-status-red border-status-red/40 bg-status-red/10"
    : s === "warning"
      ? "text-status-yellow border-status-yellow/40 bg-status-yellow/10"
      : "text-primary border-primary/40 bg-primary/10";

const partyLabel = (p: MessageParty) =>
  [p.full_name || p.email, p.email && p.full_name ? p.email : null].filter(Boolean).join(" · ") ||
  "—";


export const InboxTab = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [filter, setFilter] = useState<"all" | "unread" | "done" | "sent">("unread");
  const [selected, setSelected] = useState<InboxMessage | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const { data: messages = [], isLoading } = useInboxMessages(filter);
  const mark = useMarkMessage();
  const send = useSendMessage();
  const dateLocale = i18n.language?.startsWith("en") ? enUS : nb;

  const threadRoot = selected?.thread_root_id ?? selected?.id ?? null;
  const { data: threadData } = useMessageThread(threadRoot);
  const thread = threadData?.messages ?? [];
  const participants = (threadData?.participants ?? []).filter((p) => p.id !== user?.id);

  useEffect(() => {
    if (thread.length > 0) {
      threadEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [thread.length]);

  useEffect(() => {
    setReplyText("");
  }, [selected?.id]);

  const openMessage = (m: InboxMessage) => {
    setSelected(m);
    if (filter !== "sent" && (m.status === "unread" || (m.thread_unread_count ?? 0) > 0)) {
      mark.mutate({ id: m.id, ids: m.thread_message_ids, status: "read" });
    }
  };

  const openCompose = () => setComposeOpen(true);

  // Reply targets: for broadcasts only the original sender, otherwise all participants.
  const replyRecipientIds = (() => {
    if (selected?.is_broadcast && selected.sender_id !== user?.id) {
      return selected.sender_id ? [selected.sender_id] : [];
    }
    const ids = new Set<string>();
    for (const p of participants) ids.add(p.id);
    if (selected?.sender_id && selected.sender_id !== user?.id) ids.add(selected.sender_id);
    for (const r of selected?.recipients ?? []) {
      if (r.id && r.id !== user?.id) ids.add(r.id);
    }
    // Fallback: derive from the thread itself so the composer never disappears
    for (const m of thread) {
      if (m.sender_id && m.sender_id !== user?.id) ids.add(m.sender_id);
      const legacy = (m as { recipient_id?: string | null }).recipient_id;
      if (legacy && legacy !== user?.id) ids.add(legacy);
    }
    if (selected?.recipient_id && selected.recipient_id !== user?.id) ids.add(selected.recipient_id);
    return Array.from(ids);

  })();

  const canReply = replyRecipientIds.length > 0;


  const handleSendReply = async () => {
    if (!replyText.trim() || replyRecipientIds.length === 0 || !selected) return;
    const lastMessage = thread[thread.length - 1] ?? selected;
    await send.mutateAsync({
      recipient_ids: replyRecipientIds,
      subject: selected.subject,
      body: replyText.trim(),
      parent_id: lastMessage.id,
    });
    setReplyText("");
  };

  const renderCounterparty = (m: InboxMessage) => {
    if (filter === "sent") {
      const list = m.recipients ?? [];
      if (list.length === 0) return t("inbox.sentTo", "To recipient");
      const first = partyLabel(list[0]);
      return list.length > 1
        ? `${t("inbox.toPrefix", "To")}: ${first} +${list.length - 1}`
        : `${t("inbox.toPrefix", "To")}: ${first}`;
    }
    const name = m.sender_name || t("inbox.systemSender");
    return [name, m.sender_email, m.sender_company].filter(Boolean).join(" · ");
  };

  return (
    <>
      <Card className="border-0 sm:border shadow-none sm:shadow">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 space-y-0 p-3 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Inbox className="w-4 h-4" />
              {t("inbox.title")}
            </CardTitle>
            <Button size="sm" onClick={openCompose} className="sm:hidden">
              <Plus className="w-4 h-4 mr-1" />
              {t("inbox.newMessage", "New")}
            </Button>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)} className="w-full sm:w-auto">
              <TabsList className="w-full sm:w-auto grid grid-cols-4 sm:flex">
                <TabsTrigger value="all" className="text-xs sm:text-sm">{t("inbox.filter.all")}</TabsTrigger>
                <TabsTrigger value="unread" className="text-xs sm:text-sm">{t("inbox.filter.unread")}</TabsTrigger>
                <TabsTrigger value="done" className="text-xs sm:text-sm">{t("inbox.filter.done")}</TabsTrigger>
                <TabsTrigger value="sent" className="text-xs sm:text-sm">{t("inbox.filter.sent", "Sent")}</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button size="sm" onClick={openCompose} className="hidden sm:inline-flex">
              <Plus className="w-4 h-4 mr-1" />
              {t("inbox.newMessage", "New message")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">{t("inbox.empty")}</p>
          ) : (
            <ul className="divide-y divide-border w-full">
              {messages.map((m) => (
                <li
                  key={m.id}
                  onClick={() => openMessage(m)}
                  className={cn(
                    "flex items-start gap-2 sm:gap-3 py-2.5 px-1 cursor-pointer hover:bg-muted/50 rounded-sm transition w-full",
                    m.status === "unread" && filter !== "sent" && "font-medium",
                  )}
                >
                  <div className="mt-0.5 shrink-0">{sevIcon(m.severity)}</div>
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <div className="flex items-start gap-2 flex-wrap">
                      <span className="text-sm break-words min-w-0 flex-1">{m.subject}</span>
                      {(m.thread_unread_count ?? 0) > 1 && (
                        <Badge className="text-[10px] shrink-0">
                          {t("inbox.newInThread", "{{count}} new", { count: m.thread_unread_count })}
                        </Badge>
                      )}
                      {m.is_broadcast && m.sender_id === user?.id && (
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          <Megaphone className="w-3 h-3 mr-1" />
                          {t("inbox.broadcastBadge", "Broadcast")}
                        </Badge>
                      )}

                      {!m.is_broadcast && (m.recipients?.length ?? 0) > 1 && (
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          <Users className="w-3 h-3 mr-1" />
                          {m.recipients!.length + 1}
                        </Badge>
                      )}
                      {(m.thread_message_count ?? 1) > 1 && (
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          <MessagesSquare className="w-3 h-3 mr-1" />
                          {m.thread_message_count}
                        </Badge>
                      )}
                      {m.status === "done" && (
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          {t("inbox.status.done")}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground break-words">
                      {renderCounterparty(m)}
                      {" · "}
                      {formatDistanceToNow(new Date(m.created_at), { addSuffix: true, locale: dateLocale })}
                    </div>
                  </div>
                  {m.status === "unread" && filter !== "sent" && (
                    <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-md p-0 flex flex-col h-full gap-0">
          {selected && (
            <>
              {/* Header */}
              <SheetHeader className="p-4 sm:p-6 border-b shrink-0 space-y-2 text-left">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={cn("uppercase text-[10px]", sevClass(selected.severity))}>
                    {t(`audit.severity.${selected.severity}`)}
                  </Badge>
                  {selected.is_broadcast && selected.sender_id === user?.id && (
                    <Badge variant="outline" className="text-[10px]">
                      <Megaphone className="w-3 h-3 mr-1" />
                      {t("inbox.broadcastBadge", "Broadcast")}
                    </Badge>
                  )}

                </div>
                <SheetTitle className="break-words text-base sm:text-lg">{selected.subject}</SheetTitle>
                {participants.length > 0 && (
                  <p className="text-xs text-muted-foreground break-words">
                    {t("inbox.participants", "Participants")}:{" "}
                    {participants.map((p) => partyLabel(p)).join(", ")}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  {selected.deep_link && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const path = selected.deep_link!;
                        navigate(path);
                        setSelected(null);
                      }}
                    >
                      {t("inbox.goToModule")} <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  )}
                  {selected.status !== "done" && filter !== "sent" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        mark.mutate({ id: selected.id, ids: selected.thread_message_ids, status: "done" });
                        setSelected(null);
                      }}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1" />
                      {t("inbox.markDone")}
                    </Button>
                  )}
                </div>
              </SheetHeader>

              {/* Thread (scrollable) */}
              <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3">
                {(thread.length > 0
                  ? thread
                  : [
                      {
                        id: selected.id,
                        sender_id: selected.sender_id,
                        sender_name: selected.sender_name,
                        sender_email: selected.sender_email,
                        sender_company: selected.sender_company,
                        body: selected.body,
                        created_at: selected.created_at,
                      },
                    ]
                ).map((m) => {
                  const mine = m.sender_id === user?.id;
                  const meta = [m.sender_name || t("inbox.systemSender"), m.sender_company, m.sender_email]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <div
                      key={m.id}
                      className={cn(
                        "rounded-lg p-3 text-sm max-w-[90%]",
                        mine
                          ? "bg-primary/10 border border-primary/30 ml-auto"
                          : "bg-muted border border-border",
                      )}
                    >
                      <div className="text-xs text-muted-foreground mb-1 break-words">
                        {meta} · {new Date(m.created_at).toLocaleString(i18n.language)}
                      </div>
                      <div className="whitespace-pre-wrap break-words leading-relaxed">{m.body}</div>
                    </div>
                  );
                })}
                <div ref={threadEndRef} />
              </div>

              {/* Reply composer (fixed bottom) */}
              {canReply && (
                <div className="border-t p-3 sm:p-4 shrink-0 space-y-2 bg-background">
                  <Textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={t("inbox.replyPlaceholder", "Skriv et svar…")}
                    rows={3}
                    maxLength={4000}
                    className="resize-none"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground truncate">
                      {selected.is_broadcast || replyRecipientIds.length <= 1
                        ? t("inbox.replyToSender", "Reply goes to {{name}}", {
                            name:
                              selected.sender_name ||
                              selected.sender_email ||
                              t("inbox.senderFallback", "the sender"),
                          })

                        : t("inbox.replyToAll", "Reply goes to all participants")}
                    </span>

                    <Button size="sm" onClick={handleSendReply} disabled={send.isPending || !replyText.trim()}>
                      {send.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4 mr-2" />
                      )}
                      {t("inbox.sendReply", "Send svar")}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      <ComposeMessageDialog open={composeOpen} onOpenChange={setComposeOpen} />
    </>
  );
};
