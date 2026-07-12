import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { useTranslation } from "react-i18next";

interface Props {
  courseId: string;
  courseTitle: string;
  onBack: () => void;
}

interface AssignmentRow {
  id: string;
  profile_id: string;
  company_id: string;
  assigned_at: string;
  completed_at: string | null;
  score: number | null;
  passed: boolean | null;
  profiles?: { full_name: string | null; email: string | null } | null;
  companies?: { navn: string } | null;
}

export const TrainingStatusView = ({ courseId, courseTitle, onBack }: Props) => {
  const { t } = useTranslation();
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAssignments();
  }, [courseId]);

  const fetchAssignments = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("training_assignments")
        .select("*, profiles(full_name, email), companies(navn)")
        .eq("course_id", courseId)
        .order("assigned_at", { ascending: false });

      if (error) throw error;
      setAssignments((data as AssignmentRow[]) || []);
    } catch (err) {
      console.error("Error fetching assignments:", err);
    } finally {
      setLoading(false);
    }
  };

  const total = assignments.length;
  const completed = assignments.filter((a) => a.completed_at).length;
  const passed = assignments.filter((a) => a.passed).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-xl font-bold">{courseTitle}</h2>
          <p className="text-sm text-muted-foreground">
            {t("training.statusView.assignedCompletedPassed", { total, completed, passed })}
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{t("training.statusView.loading")}</p>
      ) : assignments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("training.statusView.noAssignments")}</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("training.statusView.employee")}</TableHead>
                <TableHead>{t("training.statusView.department")}</TableHead>
                <TableHead>{t("training.statusView.assigned")}</TableHead>
                <TableHead>{t("training.statusView.status")}</TableHead>
                <TableHead>{t("training.statusView.score")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <div>
                      <p className="text-sm font-medium">{(a.profiles as any)?.full_name || t("training.statusView.unknown")}</p>
                      <p className="text-xs text-muted-foreground">{(a.profiles as any)?.email}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{(a.companies as any)?.navn || "—"}</TableCell>
                  <TableCell className="text-sm">{format(new Date(a.assigned_at), "d. MMM yyyy", { locale: nb })}</TableCell>
                  <TableCell>
                    {!a.completed_at ? (
                      <Badge variant="secondary">{t("training.statusView.notCompleted")}</Badge>
                    ) : a.passed ? (
                      <Badge className="bg-primary text-primary-foreground">{a.score == null ? t("training.statusView.completed") : t("training.statusView.passed")}</Badge>
                    ) : (
                      <Badge variant="destructive">{t("training.statusView.notPassed")}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{a.score != null ? `${a.score}%` : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};
