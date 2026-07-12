import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useRoleCheck } from "@/hooks/useRoleCheck";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { History, Send, Users, UserCog, Globe, Loader2, RefreshCw, ChevronDown, ChevronUp, Eye } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import { enUS } from "date-fns/locale";

interface Campaign {
  id: string;
  company_id: string | null;
  recipient_type: string;
  subject: string;
  html_content: string;
  sent_at: string;
  emails_sent: number;
  sent_to_emails: string[];
  failed_emails: string[];
}

const recipientTypeLabelKey = (type: string): string | null => {
  if (type === "users") return "myCompanyUsers";
  if (type === "customers") return "customers";
  if (type === "all_users") return "allUsers";
  return null;
};

const recipientTypeIcon = (type: string) => {
  if (type === "users") return <Users className="h-3 w-3" />;
  if (type === "customers") return <UserCog className="h-3 w-3" />;
  if (type === "all_users") return <Globe className="h-3 w-3" />;
  return null;
};

export const CampaignHistorySection = () => {
  const { t, i18n } = useTranslation();
  const { companyId } = useAuth();
  const { isSuperAdmin } = useRoleCheck();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewCampaign, setPreviewCampaign] = useState<Campaign | null>(null);
  const [sending, setSending] = useState(false);
  const [missedCount, setMissedCount] = useState<number | null>(null);
  const [loadingMissed, setLoadingMissed] = useState(false);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (companyId) fetchCampaigns();
  }, [companyId, isSuperAdmin]);

  const fetchCampaigns = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      let query = supabase
        .from("bulk_email_campaigns")
        .select("*")
        .order("sent_at", { ascending: false })
        .limit(20);

      if (!isSuperAdmin) {
        query = query.eq("company_id", companyId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setCampaigns((data || []) as Campaign[]);
    } catch (error) {
      console.error("Error fetching campaigns:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendToMissedClick = async (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setMissedCount(null);
    setLoadingMissed(true);
    setConfirmOpen(true);

    try {
      const { data, error } = await supabase.functions.invoke("send-notification-email", {
        body: { type: "preview_missed_count", campaignId: campaign.id },
      });
      if (error) throw error;
      setMissedCount(data?.missedCount ?? 0);
    } catch (e) {
      console.error("Error fetching missed count:", e);
      setMissedCount(null);
    } finally {
      setLoadingMissed(false);
    }
  };

  const handleSendToMissed = async () => {
    if (!selectedCampaign) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-notification-email", {
        body: { type: "send_to_missed", campaignId: selectedCampaign.id },
      });
      if (error) throw error;
      const sent = data?.emailsSent ?? 0;
      toast.success(t('admin.campaignHistory.sentToNewRecipients', { count: sent }));
      fetchCampaigns();
    } catch (e: any) {
      toast.error(t('admin.campaignHistory.sendFailed', { message: e.message }));
    } finally {
      setSending(false);
      setConfirmOpen(false);
      setSelectedCampaign(null);
    }
  };

  if (!loading && campaigns.length === 0) return null;

  return (
    <>
      <GlassCard className="p-3 sm:p-6 mt-4 sm:mt-6">
        <div className="flex items-center justify-between mb-4">
          <button
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            onClick={() => setExpanded(v => !v)}
          >
            <History className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            <h2 className="text-base sm:text-xl font-semibold">{t('admin.campaignHistory.title')}</h2>
            {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          <Button variant="ghost" size="sm" onClick={fetchCampaigns} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {expanded && (
          <div className="space-y-3">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : campaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t('admin.campaignHistory.noCampaigns')}</p>
            ) : (
              campaigns.map((campaign) => (
                <div
                  key={campaign.id}
                  className="rounded-lg border border-border bg-card/50 p-3 sm:p-4 space-y-2"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div className="space-y-1 flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{campaign.subject}</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>
                          {format(new Date(campaign.sent_at), "d. MMM yyyy HH:mm", { locale: i18n.language === "en" ? enUS : nb })}
                        </span>
                        <Badge variant="secondary" className="flex items-center gap-1 text-xs py-0">
                          {recipientTypeIcon(campaign.recipient_type)}
                          {(() => {
                            const key = recipientTypeLabelKey(campaign.recipient_type);
                            return key ? t(`admin.campaignHistory.recipientTypes.${key}`) : campaign.recipient_type;
                          })()}
                        </Badge>
                        <span className="text-foreground font-medium">
                          {t('admin.campaignHistory.sentCount', { count: campaign.emails_sent })}
                        </span>
                        {campaign.failed_emails?.length > 0 && (
                          <span className="text-destructive">
                            {t('admin.campaignHistory.failedCount', { count: campaign.failed_emails.length })}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs"
                        onClick={() => { setPreviewCampaign(campaign); setPreviewOpen(true); }}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        {t('admin.campaignHistory.view')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-3 text-xs"
                        onClick={() => handleSendToMissedClick(campaign)}
                      >
                        <Send className="h-3 w-3 mr-1" />
                        {t('admin.campaignHistory.sendToNew')}
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </GlassCard>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('admin.campaignHistory.previewTitle', { subject: previewCampaign?.subject })}</DialogTitle>
            <DialogDescription>
              {t('admin.campaignHistory.sentAt', { date: previewCampaign ? format(new Date(previewCampaign.sent_at), "d. MMM yyyy HH:mm", { locale: i18n.language === "en" ? enUS : nb }) : "" })}
            </DialogDescription>
          </DialogHeader>
          <div className="border rounded-lg overflow-hidden bg-white">
            <div
              className="p-4"
              dangerouslySetInnerHTML={{ __html: previewCampaign?.html_content || "" }}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Send to Missed Dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('admin.campaignHistory.sendToNewTitle')}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  {t('admin.campaignHistory.campaignLabel')} <strong>{selectedCampaign?.subject}</strong>
                </p>
                {loadingMissed ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('admin.campaignHistory.countingRecipients')}
                  </div>
                ) : missedCount !== null ? (
                  missedCount === 0 ? (
                    <p className="text-muted-foreground">
                      {t('admin.campaignHistory.allReceived')}
                    </p>
                  ) : (
                    <p>
                      {t('admin.campaignHistory.missedCountMessage', { count: missedCount })}
                    </p>
                  )
                ) : (
                  <p className="text-muted-foreground">{t('admin.campaignHistory.missedCountError')}</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>{t('admin.campaignHistory.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSendToMissed}
              disabled={sending || loadingMissed || missedCount === 0}
            >
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('admin.campaignHistory.sending')}
                </>
              ) : (
                t('admin.campaignHistory.sendEmail')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
