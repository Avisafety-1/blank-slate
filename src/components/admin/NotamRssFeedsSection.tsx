import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Rss, RefreshCw, Loader2, Globe2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { useTranslation } from "react-i18next";

interface Feed {
  id: string;
  name: string;
  feed_url: string;
  enabled: boolean;
  created_at: string;
  source_type: "rss" | "country_briefing";
  country: string | null;
  last_synced_at: string | null;
  last_upserted_count: number | null;
  last_error: string | null;
}

export function NotamRssFeedsSection() {
  const { t, i18n } = useTranslation();
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetchFeeds();
  }, []);

  const fetchFeeds = async () => {
    const { data, error } = await supabase
      .from("notam_rss_feeds" as any)
      .select("*")
      .order("source_type", { ascending: true })
      .order("name", { ascending: true });
    if (error) {
      console.error("Error fetching NOTAM feeds:", error);
    } else {
      setFeeds((data as any) || []);
    }
    setLoading(false);
  };

  const addFeed = async () => {
    if (!newName.trim() || !newUrl.trim()) {
      toast.error(t('admin.notamRss.fillNameAndUrl'));
      return;
    }
    setAdding(true);
    const { error } = await supabase
      .from("notam_rss_feeds" as any)
      .insert({ name: newName.trim(), feed_url: newUrl.trim(), source_type: "rss" } as any);
    if (error) {
      toast.error(t('admin.notamRss.addFeedError', { message: error.message }));
    } else {
      toast.success(t('admin.notamRss.feedAdded'));
      setNewName("");
      setNewUrl("");
      fetchFeeds();
    }
    setAdding(false);
  };

  const toggleFeed = async (id: string, enabled: boolean) => {
    const { error } = await supabase
      .from("notam_rss_feeds" as any)
      .update({ enabled } as any)
      .eq("id", id);
    if (error) {
      toast.error(t('admin.notamRss.updateFeedError'));
    } else {
      setFeeds(prev => prev.map(f => f.id === id ? { ...f, enabled } : f));
    }
  };

  const deleteFeed = async (id: string) => {
    const { error } = await supabase
      .from("notam_rss_feeds" as any)
      .delete()
      .eq("id", id);
    if (error) {
      toast.error(t('admin.notamRss.deleteFeedError'));
    } else {
      setFeeds(prev => prev.filter(f => f.id !== id));
      toast.success(t('admin.notamRss.feedDeleted'));
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-notams");
      if (error) throw error;
      toast.success(t('admin.notamRss.syncComplete', { count: data?.upserted || 0, source: data?.source || t('admin.notamRss.unknownSource') }));
      fetchFeeds();
    } catch (err: any) {
      toast.error(t('admin.notamRss.syncError', { message: err?.message || String(err) }));
    }
    setSyncing(false);
  };

  const formatSynced = (feed: Feed) => {
    if (!feed.last_synced_at) return t('admin.notamRss.neverSynced');
    const time = new Date(feed.last_synced_at).toLocaleString(i18n.language);
    return t('admin.notamRss.lastSynced', { time });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const countryFeeds = feeds.filter(f => f.source_type === "country_briefing");
  const rssFeeds = feeds.filter(f => f.source_type !== "country_briefing");

  return (
    <div className="space-y-4">
      {/* Country briefings (notaminfo per-country, no boundary) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Globe2 className="h-5 w-5" />
                {t('admin.notamRss.countryTitle')}
              </CardTitle>
              <CardDescription>{t('admin.notamRss.countryDescription')}</CardDescription>
            </div>
            <Button onClick={syncNow} disabled={syncing} size="sm" variant="outline">
              {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              {t('admin.notamRss.syncNow')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {countryFeeds.map(feed => (
            <div key={feed.id} className="flex items-center gap-3 p-3 border rounded-lg">
              <Switch checked={feed.enabled} onCheckedChange={(v) => toggleFeed(feed.id, v)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{feed.country}</span>
                  <Badge variant={feed.enabled ? "default" : "secondary"} className="text-xs">
                    {feed.enabled ? t('admin.notamRss.active') : t('admin.notamRss.inactive')}
                  </Badge>
                  {feed.last_upserted_count != null && (
                    <Badge variant="outline" className="text-xs">
                      {t('admin.notamRss.lastCount', { count: feed.last_upserted_count })}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatSynced(feed)}
                  {feed.last_error ? ` • ${t('admin.notamRss.syncFailed', { error: feed.last_error })}` : ""}
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Classic RSS feeds */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Rss className="h-5 w-5" />
                {t('admin.notamRss.title')}
              </CardTitle>
              <CardDescription>{t('admin.notamRss.description')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {rssFeeds.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('admin.notamRss.noFeeds')}</p>
          )}
          {rssFeeds.map(feed => (
            <div key={feed.id} className="flex items-center gap-3 p-3 border rounded-lg">
              <Switch checked={feed.enabled} onCheckedChange={(v) => toggleFeed(feed.id, v)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{feed.name}</span>
                  <Badge variant={feed.enabled ? "default" : "secondary"} className="text-xs">
                    {feed.enabled ? t('admin.notamRss.active') : t('admin.notamRss.inactive')}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate">{feed.feed_url}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => deleteFeed(feed.id)}
                className="shrink-0 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <div className="border-t pt-4 space-y-3">
            <Label className="text-sm font-medium">{t('admin.notamRss.addNewFeed')}</Label>
            <div className="flex gap-2">
              <Input
                placeholder={t('admin.notamRss.namePlaceholder')}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="flex-1"
              />
              <Input
                placeholder="https://notaminfo.com/feed?u=..."
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                className="flex-[2]"
              />
              <Button onClick={addFeed} disabled={adding} size="icon" className="shrink-0">
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('admin.notamRss.helpText')}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
