import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Edit, Loader2, Copy } from "lucide-react";
import { DraftEditorDialog } from "./DraftEditorDialog";

export const MarketingDrafts = () => {
  const { companyId, user } = useAuth();
  const queryClient = useQueryClient();
  const [editDraft, setEditDraft] = useState<any>(null);

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

  const createBlank = async () => {
    const { data, error } = await supabase
      .from("marketing_drafts")
      .insert({
        company_id: companyId!,
        created_by: user?.id,
        title: "Nytt utkast",
        platform: "linkedin",
      })
      .select()
      .single();
    if (error) {
      toast.error("Kunne ikke opprette utkast");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["marketing-drafts"] });
    setEditDraft(data);
  };

  const duplicateDraft = async (source: any) => {
    const { error } = await supabase.from("marketing_drafts").insert({
      company_id: companyId!,
      created_by: user?.id,
      title: `${source.title} (kopi)`,
      content: source.content,
      platform: source.platform,
      status: "draft",
      metadata: source.metadata,
    });
    if (error) {
      toast.error("Kunne ikke duplisere utkast");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["marketing-drafts"] });
    queryClient.invalidateQueries({ queryKey: ["marketing-drafts-count"] });
    toast.success("Utkast duplisert");
  };

  const deleteDraft = async (id: string) => {
    await supabase.from("marketing_drafts").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["marketing-drafts"] });
    queryClient.invalidateQueries({ queryKey: ["marketing-drafts-count"] });
  };

  const statusLabels: Record<string, string> = {
    draft: "Utkast",
    review: "Gjennomgang",
    approved: "Godkjent",
    scheduled: "Planlagt",
    published: "Publisert",
  };

  const statusColors: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    review: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
    approved: "bg-green-500/10 text-green-700 dark:text-green-400",
    scheduled: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
    published: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Utkast</h1>
          <p className="text-muted-foreground text-sm mt-1">Rediger og administrer innholdsutkast.</p>
        </div>
        <Button onClick={createBlank} className="gap-2">
          <Plus className="w-4 h-4" /> Nytt utkast
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : drafts.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">
          Ingen utkast ennå. Opprett et nytt eller generer fra en idé.
        </p>
      ) : (
        <div className="space-y-3">
          {drafts.map((draft) => {
            const meta = draft.metadata as any;
            const lang = meta?.language;
            const isTemplate = meta?.isTemplate;
            return (
              <Card key={draft.id} className="bg-card border-border">
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium text-foreground">{draft.title}</h3>
                        <Badge variant="secondary" className={statusColors[draft.status] || ""}>
                          {statusLabels[draft.status] || draft.status}
                        </Badge>
                        {draft.platform && (
                          <Badge variant="outline" className="text-xs capitalize">
                            {draft.platform}
                          </Badge>
                        )}
                        {lang && (
                          <Badge variant="outline" className="text-xs">
                            {lang === "en" ? "EN" : "NO"}
                          </Badge>
                        )}
                        {isTemplate && (
                          <Badge variant="outline" className="text-xs bg-accent/10">
                            Mal
                          </Badge>
                        )}
                      </div>
                      {draft.content && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {draft.content.slice(0, 150)}...
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">
                        Oppdatert {new Date(draft.updated_at).toLocaleDateString("nb-NO")}
                      </p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => setEditDraft(draft)} title="Rediger">
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => duplicateDraft(draft)} title="Dupliser">
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteDraft(draft.id)} title="Slett">
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <DraftEditorDialog
        draft={editDraft}
        open={!!editDraft}
        onOpenChange={(open) => !open && setEditDraft(null)}
      />
    </div>
  );
};
