import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Search } from "lucide-react";

interface Props {
  courseId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string | null;
  company_id: string | null;
  companies?: { navn: string } | null;
}

export const TrainingAssignmentDialog = ({ courseId, open, onOpenChange }: Props) => {
  const { companyId } = useAuth();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) fetchData();
  }, [open, courseId]);

  const fetchData = async () => {
    // Fetch all profiles visible to this admin
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name, email, company_id, companies(navn)")
      .eq("approved", true)
      .order("full_name");

    setProfiles((profs as ProfileRow[]) || []);

    // Fetch existing assignments
    const { data: assignments } = await supabase
      .from("training_assignments")
      .select("profile_id")
      .eq("course_id", courseId);

    const ids = new Set((assignments || []).map((a: any) => a.profile_id));
    setAssignedIds(ids);
    setSelectedIds(new Set());
  };

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAssign = async () => {
    if (selectedIds.size === 0) return;
    setSaving(true);
    try {
      const inserts = Array.from(selectedIds).map((profileId) => {
        const profile = profiles.find((p) => p.id === profileId);
        return {
          course_id: courseId,
          profile_id: profileId,
          company_id: profile?.company_id || companyId!,
        };
      });

      const { error } = await supabase.from("training_assignments").insert(inserts);
      if (error) throw error;

      // Fetch course title for email
      const { data: courseData } = await supabase
        .from("training_courses")
        .select("title")
        .eq("id", courseId)
        .single();

      const courseName = courseData?.title || "Kurs";

      // Send notification emails (fire and forget)
      for (const profileId of selectedIds) {
        const profile = profiles.find((p) => p.id === profileId);
        supabase.functions.invoke("send-notification-email", {
          body: {
            type: "notify_training_assigned",
            companyId: profile?.company_id || companyId,
            trainingAssigned: {
              recipientId: profileId,
              courseName,
            },
          },
        }).catch((err) => console.error("Email error:", err));
      }

      toast.success(`${selectedIds.size} ansatte tildelt kurset`);
      onOpenChange(false);
    } catch (err) {
      console.error("Error assigning:", err);
      toast.error("Kunne ikke tildele kurs");
    } finally {
      setSaving(false);
    }
  };

  const filtered = profiles.filter((p) => {
    if (assignedIds.has(p.id)) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      (p.full_name || "").toLowerCase().includes(q) ||
      (p.email || "").toLowerCase().includes(q)
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Tildel kurs til ansatte</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Søk etter ansatt..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {assignedIds.size > 0 && (
          <p className="text-xs text-muted-foreground">{assignedIds.size} allerede tildelt (skjult)</p>
        )}

        <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Ingen ansatte funnet</p>
          ) : (
            filtered.map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent/10 cursor-pointer"
              >
                <Checkbox checked={selectedIds.has(p.id)} onCheckedChange={() => toggle(p.id)} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.full_name || "Ukjent"}</p>
                  <p className="text-xs text-muted-foreground truncate">{p.email}</p>
                </div>
                {(p.companies as any)?.navn && (
                  <Badge variant="secondary" className="text-[10px] flex-shrink-0">
                    {(p.companies as any).navn}
                  </Badge>
                )}
              </label>
            ))
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button onClick={handleAssign} disabled={saving || selectedIds.size === 0}>
            {saving ? "Tildeler..." : `Tildel (${selectedIds.size})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
