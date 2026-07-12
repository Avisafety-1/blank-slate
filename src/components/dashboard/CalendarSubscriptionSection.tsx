import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, RefreshCw, Trash2, Link, Loader2, Mail } from "lucide-react";
import { useCalendarSubscription } from "@/hooks/useCalendarSubscription";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function CalendarSubscriptionSection() {
  const { t, i18n } = useTranslation();
  const { user, companyId } = useAuth();
  const [sendingEmail, setSendingEmail] = useState(false);
  const {
    subscription,
    feedUrl,
    loading,
    generating,
    generateSubscription,
    deleteSubscription,
    regenerateSubscription,
    copyToClipboard,
  } = useCalendarSubscription();

  const sendEmailLink = async () => {
    if (!user || !feedUrl || !companyId) return;
    setSendingEmail(true);
    try {
      const { error } = await supabase.functions.invoke("send-calendar-link", {
        body: { userId: user.id, feedUrl, companyId },
      });
      if (error) throw error;
      toast.success(t("dashboard.calendarSubscription.emailSent"));
    } catch (err) {
      console.error("Error sending calendar link email:", err);
      toast.error(t("dashboard.calendarSubscription.emailError"));
    } finally {
      setSendingEmail(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const locale = i18n.language === "en" ? "en-GB" : "nb-NO";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground px-2">{t("dashboard.calendarSubscription.or")}</span>
        <Separator className="flex-1" />
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Link className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">{t("dashboard.calendarSubscription.autoSync")}</span>
        </div>

        {subscription && feedUrl ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {t("dashboard.calendarSubscription.addUrlHint")}
            </p>

            <div className="flex gap-2">
              <Input
                value={feedUrl}
                readOnly
                className="text-xs font-mono bg-muted/50"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={copyToClipboard}
                title={t("dashboard.calendarSubscription.copyLink")}
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={sendEmailLink}
                disabled={sendingEmail}
                title={t("dashboard.calendarSubscription.sendEmail")}
              >
                {sendingEmail ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
              </Button>
            </div>

            <div className="flex gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="flex-1">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {t("dashboard.calendarSubscription.generateNew")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("dashboard.calendarSubscription.generateNewConfirmTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("dashboard.calendarSubscription.generateNewConfirmDesc")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("dashboard.calendarSubscription.cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={regenerateSubscription}>
                      {t("dashboard.calendarSubscription.generateNewAction")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="flex-1">
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t("dashboard.calendarSubscription.deleteLink")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("dashboard.calendarSubscription.deleteConfirmTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("dashboard.calendarSubscription.deleteConfirmDesc")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("dashboard.calendarSubscription.cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={deleteSubscription} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      {t("dashboard.calendarSubscription.delete")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {subscription.last_accessed_at && (
              <p className="text-xs text-muted-foreground">
                {t("dashboard.calendarSubscription.lastAccessed", {
                  date: new Date(subscription.last_accessed_at).toLocaleString(locale),
                })}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {t("dashboard.calendarSubscription.generateHint")}
            </p>

            <Button
              onClick={generateSubscription}
              disabled={generating}
              className="w-full"
              variant="outline"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Link className="h-4 w-4 mr-2" />
              )}
              {t("dashboard.calendarSubscription.generateButton")}
            </Button>
          </div>
        )}

        <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
          <p className="text-xs font-medium">{t("dashboard.calendarSubscription.howToAddTitle")}</p>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• {t("dashboard.calendarSubscription.howGoogle")}</li>
            <li>• {t("dashboard.calendarSubscription.howIphone")}</li>
            <li>• {t("dashboard.calendarSubscription.howOutlook")}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
