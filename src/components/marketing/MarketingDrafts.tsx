import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Trash2, Edit, Loader2, Copy, Facebook, Instagram, Linkedin, ExternalLink, Clock, Calendar } from "lucide-react";
import { DraftEditorDialog } from "./DraftEditorDialog";
import { format } from "date-fns";
import { nb, enGB } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { getCurrentLanguage, getIntlLocale } from "@/lib/i18nHelpers";

export const MarketingDrafts = () => {
  const { companyId, user } = useAuth();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const dfLocale = getCurrentLanguage() === "en" ? enGB : nb;
  const intlLocale = getIntlLocale();
  const [editDraft, setEditDraft] = useState<any>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [publishingIgId, setPublishingIgId] = useState<string | null>(null);
  const [publishingLiId, setPublishingLiId] = useState<string | null>(null);
  const [tab, setTab] = useState("all");

  const { data: drafts = [], isLoading } = useQuery({
    queryKey: ["marketing-drafts", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_drafts")
        .select("*")
        .eq("company_id", companyId!)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const filteredDrafts = drafts.filter((d) => {
    if (tab === "all") return true;
    if (tab === "ready") return d.status === "approved";
    if (tab === "scheduled") return d.status === "scheduled";
    if (tab === "published") return d.status === "published";
    return true;
  });

  const createBlank = async () => {
    const { data, error } = await supabase
      .from("marketing_drafts")
      .insert({
        company_id: companyId!,
        created_by: user?.id,
        title: t("pages.marketing.newDraftTitle"),
        platform: "linkedin",
      })
      .select()
      .single();
    if (error) {
      toast.error(t("pages.marketing.couldNotCreateDraftShort"));
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["marketing-drafts"] });
    setEditDraft(data);
  };

  const duplicateDraft = async (source: any) => {
    const { error } = await supabase.from("marketing_drafts").insert({
      company_id: companyId!,
      created_by: user?.id,
      title: `${source.title} ${t("pages.marketing.copySuffix")}`,
      content: source.content,
      platform: source.platform,
      status: "draft",
      metadata: source.metadata,
    });
    if (error) {
      toast.error(t("pages.marketing.couldNotDuplicate"));
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["marketing-drafts"] });
    queryClient.invalidateQueries({ queryKey: ["marketing-drafts-count"] });
    toast.success(t("pages.marketing.draftDuplicated"));
  };

  const deleteDraft = async (id: string) => {
    await supabase.from("marketing_drafts").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["marketing-drafts"] });
    queryClient.invalidateQueries({ queryKey: ["marketing-drafts-count"] });
  };

  const handleQuickPublish = async (draft: any) => {
    setPublishingId(draft.id);
    try {
      const text = draft.content;
      if (!text?.trim()) {
        toast.error(t("pages.marketing.postHasNoText"));
        return;
      }
      const { data: media } = await supabase
        .from("marketing_media")
        .select("file_url")
        .eq("draft_id", draft.id)
        .order("created_at", { ascending: false })
        .limit(1);
      const imageUrl = media?.[0]?.file_url || undefined;

      const { data, error } = await supabase.functions.invoke("publish-facebook", {
        body: { text, imageUrl, draftId: draft.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      queryClient.invalidateQueries({ queryKey: ["marketing-drafts"] });
      toast.success(t("pages.marketing.publishedToFacebook"), {
        action: data.postUrl ? { label: t("pages.marketing.open"), onClick: () => window.open(data.postUrl, "_blank") } : undefined,
      });
    } catch (e: any) {
      toast.error(e.message || t("pages.marketing.couldNotPublish"));
    } finally {
      setPublishingId(null);
    }
  };

  const handleQuickPublishInstagram = async (draft: any) => {
    setPublishingIgId(draft.id);
    try {
      const text = draft.content;
      const { data: media } = await supabase
        .from("marketing_media")
        .select("file_url")
        .eq("draft_id", draft.id)
        .order("created_at", { ascending: false })
        .limit(1);
      const imageUrl = media?.[0]?.file_url;

      if (!imageUrl) {
        toast.error(t("pages.marketing.instagramRequiresImage"));
        return;
      }

      const { data, error } = await supabase.functions.invoke("publish-instagram", {
        body: { text, imageUrl, draftId: draft.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      queryClient.invalidateQueries({ queryKey: ["marketing-drafts"] });
      toast.success(t("pages.marketing.publishedToInstagram"), {
        action: data.postUrl ? { label: t("pages.marketing.open"), onClick: () => window.open(data.postUrl, "_blank") } : undefined,
      });
    } catch (e: any) {
      toast.error(e.message || t("pages.marketing.couldNotPublishInstagram"));
    } finally {
      setPublishingIgId(null);
    }
  };

  const handleQuickPublishLinkedin = async (draft: any) => {
    setPublishingLiId(draft.id);
    try {
      const text = draft.content;
      if (!text?.trim()) {
        toast.error(t("pages.marketing.postHasNoText"));
        return;
      }
      const { data: media } = await supabase
        .from("marketing_media")
        .select("file_url")
        .eq("draft_id", draft.id)
        .order("created_at", { ascending: false })
        .limit(1);
      const imageUrl = media?.[0]?.file_url || undefined;

      const { data, error } = await supabase.functions.invoke("publish-linkedin", {
        body: { text, imageUrl, draftId: draft.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      queryClient.invalidateQueries({ queryKey: ["marketing-drafts"] });
      toast.success(t("pages.marketing.publishedToLinkedIn"), {
        action: data.postUrl ? { label: t("pages.marketing.open"), onClick: () => window.open(data.postUrl, "_blank") } : undefined,
      });
    } catch (e: any) {
      toast.error(e.message || t("pages.marketing.couldNotPublishLinkedIn"));
    } finally {
      setPublishingLiId(null);
    }
  };

  const statusLabels: Record<string, string> = {
    draft: t("pages.marketing.statusDraft"),
    review: t("pages.marketing.statusReview"),
    approved: t("pages.marketing.statusApproved"),
    scheduled: t("pages.marketing.statusScheduled"),
    published: t("pages.marketing.statusPublished"),
  };

  const statusColors: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    review: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
    approved: "bg-green-500/10 text-green-700 dark:text-green-400",
    scheduled: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
    published: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  };

  const readyCnt = drafts.filter((d) => d.status === "approved").length;
  const scheduledCnt = drafts.filter((d) => d.status === "scheduled").length;
  const publishedCnt = drafts.filter((d) => d.status === "published").length;

  const renderDraftCard = (draft: any) => {
    const meta = draft.metadata as any;
    const lang = meta?.language;
    const isTemplate = meta?.isTemplate;
    const isApproved = draft.status === "approved";
    const isScheduled = draft.status === "scheduled";
    const isPublished = draft.status === "published";

    return (
      <Card key={draft.id} className="bg-card border-border">
        <CardContent className="pt-3 pb-3">
          <div className="space-y-1.5">
            {/* Badges row */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant="secondary" className={`text-[10px] ${statusColors[draft.status] || ""}`}>
                {statusLabels[draft.status] || draft.status}
              </Badge>
              {draft.platform && (
                <Badge variant="outline" className="text-[10px] capitalize">{draft.platform}</Badge>
              )}
              {lang && (
                <Badge variant="outline" className="text-[10px]">{lang === "en" ? "EN" : "NO"}</Badge>
              )}
              {isTemplate && (
                <Badge variant="outline" className="text-[10px] bg-accent/10">{t("pages.marketing.template")}</Badge>
              )}
            </div>

            {/* Title */}
            <h3 className="font-medium text-foreground text-sm leading-snug">{draft.title}</h3>

            {/* Content preview */}
            {draft.content && (
              <p className="text-xs text-muted-foreground line-clamp-2">
                {draft.content.slice(0, 150)}...
              </p>
            )}

            {/* Info row */}
            <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
              <span>{t("pages.marketing.updated")} {new Date(draft.updated_at).toLocaleDateString(intlLocale)}</span>
              {isScheduled && draft.scheduled_at && (
                <span className="text-orange-600 dark:text-orange-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {format(new Date(draft.scheduled_at), "d. MMM HH:mm", { locale: dfLocale })}
                </span>
              )}
              {isPublished && draft.published_at && (
                <span className="text-blue-600 dark:text-blue-400 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {format(new Date(draft.published_at), "d. MMM HH:mm", { locale: dfLocale })}
                </span>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-1 items-center pt-0.5 flex-wrap">
              {isApproved && (
                <>
                  <Button
                    size="sm"
                    onClick={() => handleQuickPublish(draft)}
                    disabled={publishingId === draft.id}
                    className="gap-1 bg-[#1877F2] hover:bg-[#1877F2]/90 text-white text-xs h-7 px-2.5"
                  >
                    {publishingId === draft.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Facebook className="w-3.5 h-3.5" />
                    )}
                    Facebook
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleQuickPublishInstagram(draft)}
                    disabled={publishingIgId === draft.id}
                    className="gap-1 bg-[#E1306C] hover:bg-[#E1306C]/90 text-white text-xs h-7 px-2.5"
                  >
                    {publishingIgId === draft.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Instagram className="w-3.5 h-3.5" />
                    )}
                    Instagram
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleQuickPublishLinkedin(draft)}
                    disabled={publishingLiId === draft.id}
                    className="gap-1 bg-[#0A66C2] hover:bg-[#0A66C2]/90 text-white text-xs h-7 px-2.5"
                  >
                    {publishingLiId === draft.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Linkedin className="w-3.5 h-3.5" />
                    )}
                    LinkedIn
                  </Button>
                </>
              )}
              {isPublished && (meta?.postUrl || meta?.facebook_post_url) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(meta.postUrl || meta.facebook_post_url, "_blank")}
                  className="gap-1 text-xs h-7 px-2"
                >
                  <ExternalLink className="w-3 h-3" />
                  Facebook
                </Button>
              )}
              {isPublished && meta?.instagram_post_url && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(meta.instagram_post_url, "_blank")}
                  className="gap-1 text-xs h-7 px-2"
                >
                  <ExternalLink className="w-3 h-3" />
                  Instagram
                </Button>
              )}
              {isPublished && meta?.linkedin_post_url && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(meta.linkedin_post_url, "_blank")}
                  className="gap-1 text-xs h-7 px-2"
                >
                  <ExternalLink className="w-3 h-3" />
                  LinkedIn
                </Button>
              )}
              <div className="ml-auto flex gap-0.5">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditDraft(draft)} title={t("pages.marketing.edit")}>
                  <Edit className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => duplicateDraft(draft)} title={t("pages.marketing.duplicate")}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => deleteDraft(draft.id)} title={t("pages.marketing.delete")}>
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">{t("pages.marketing.draftsTitle")}</h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">{t("pages.marketing.draftsSubtitle")}</p>
        </div>
        <Button onClick={createBlank} className="gap-2 w-full sm:w-auto" size="sm">
          <Plus className="w-4 h-4" /> {t("pages.marketing.newDraft")}
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full grid grid-cols-4 h-auto p-1">
          <TabsTrigger value="all" className="text-[11px] sm:text-sm px-1 py-1.5">{t("pages.marketing.tabAll")} ({drafts.length})</TabsTrigger>
          <TabsTrigger value="ready" className="text-[11px] sm:text-sm px-1 py-1.5">
            {t("pages.marketing.tabReady")} ({readyCnt})
          </TabsTrigger>
          <TabsTrigger value="scheduled" className="text-[11px] sm:text-sm px-1 py-1.5">
            {t("pages.marketing.tabScheduled")} ({scheduledCnt})
          </TabsTrigger>
          <TabsTrigger value="published" className="text-[11px] sm:text-sm px-1 py-1.5">
            {t("pages.marketing.tabPublished")} ({publishedCnt})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={tab}>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredDrafts.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {tab === "ready"
                ? t("pages.marketing.noReadyDrafts")
                : tab === "scheduled"
                ? t("pages.marketing.noScheduledDrafts")
                : tab === "published"
                ? t("pages.marketing.noPublishedDrafts")
                : t("pages.marketing.noDraftsYet")}
            </p>
          ) : (
            <div className="space-y-3">
              {filteredDrafts.map(renderDraftCard)}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <DraftEditorDialog
        draft={editDraft}
        open={!!editDraft}
        onOpenChange={(open) => !open && setEditDraft(null)}
      />
    </div>
  );
};
