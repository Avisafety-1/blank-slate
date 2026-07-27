import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { nb, enUS } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Inbox, ArrowRight, CheckCircle2, AlertTriangle, AlertCircle, Info, Plus, Reply, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useInboxMessages, useMarkMessage, type InboxMessage } from "./hooks/useInboxMessages";
import { useMessageThread } from "./hooks/useMessageThread";
import { ComposeMessageDialog } from "./ComposeMessageDialog";
import type { RecipientOption } from "./hooks/useSearchRecipients";

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

export const InboxTab = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [filter, setFilter] = useState<"all" | "unread" | "done" | "sent">("unread");
  const [selected, setSelected] = useState<InboxMessage | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composePrefill, setComposePrefill] = useState<{
    parent_id?: string | null;
    recipients?: RecipientOption[];
    subject?: string;
    lockRecipients?: boolean;
  } | undefined>(undefined);
  const { data: messages = [], isLoading } = useInboxMessages(filter);
  const mark = useMarkMessage();
  const dateLocale = i18n.language?.startsWith("en") ? enUS : nb;

  const threadRoot = selected?.thread_root_id ?? selected?.id ?? null;
  const { data: thread = [] } = useMessageThread(threadRoot);

  const openMessage = (m: InboxMessage) => {
    setSelected(m);
    if (m.status === "unread" && filter !== "sent") mark.mutate({ id: m.id, status: "read" });
  };

  const openCompose = () => {
    setComposePrefill(undefined);
    setComposeOpen(true);
  };

  const openReply = () => {
    if (!selected?.sender_id) return;
    setComposePrefill({
      parent_id: selected.id,
      recipients: [
        {
          id: selected.sender_id,
          full_name: selected.sender_name ?? null,
          email: null,
          company_id: null,
          company_name: null,
        },
      ],
      subject: selected.subject.toLowerCase().startsWith("re:")
        ? selected.subject
        : `Re: ${selected.subject}`,
      lockRecipients: true,
    });
    setSelected(null);
    setComposeOpen(true);
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
                      {m.status === "done" && (
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          {t("inbox.status.done")}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground break-words">
                      {filter === "sent"
                        ? t("inbox.sentTo", { defaultValue: "To recipient" })
                        : m.sender_name || t("inbox.systemSender")}
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
        <SheetContent className="w-full sm:max-w-md p-4 sm:p-6 overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className={cn("uppercase text-[10px]", sevClass(selected.severity))}>
                    {t(`audit.severity.${selected.severity}`)}
                  </Badge>
                </div>
                <SheetTitle className="break-words">{selected.subject}</SheetTitle>
                <SheetDescription>
                  {selected.sender_name || t("inbox.systemSender")} ·{" "}
                  {new Date(selected.created_at).toLocaleString(i18n.language)}
                </SheetDescription>
              </SheetHeader>

              {/* Thread history */}
              {thread.length > 1 ? (
                <div className="mt-4 space-y-3">
                  {thread.map((m) => {
                    const mine = m.sender_id === user?.id;
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
                        <div className="text-xs text-muted-foreground mb-1">
                          {m.sender_name || t("inbox.systemSender")} ·{" "}
                          {new Date(m.created_at).toLocaleString(i18n.language)}
                        </div>
                        <div className="whitespace-pre-wrap break-words leading-relaxed">{m.body}</div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed">
                  {selected.body}
                </div>
              )}

              <div className="mt-6 flex flex-col gap-2">
                {selected.sender_id && selected.sender_id !== user?.id && (
                  <Button onClick={openReply}>
                    <Reply className="w-4 h-4 mr-2" />
                    {t("inbox.reply", "Reply")}
                  </Button>
                )}
                {selected.deep_link && (
                  <Button
                    variant={selected.sender_id ? "outline" : "default"}
                    onClick={() => {
                      const path = selected.deep_link!;
                      navigate(path);
                      setSelected(null);
                    }}
                  >
                    {t("inbox.goToModule")} <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                )}
                {selected.status !== "done" && filter !== "sent" && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      mark.mutate({ id: selected.id, status: "done" });
                      setSelected(null);
                    }}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    {t("inbox.markDone")}
                  </Button>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <ComposeMessageDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        prefill={composePrefill}
      />
    </>
  );
};
