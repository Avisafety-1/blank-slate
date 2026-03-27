import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Eye, Users, Trash2, BookOpen, Globe, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { TrainingCourseEditor } from "./TrainingCourseEditor";
import { TrainingAssignmentDialog } from "./TrainingAssignmentDialog";
import { TrainingStatusView } from "./TrainingStatusView";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Course {
  id: string;
  title: string;
  description: string | null;
  status: string;
  passing_score: number;
  validity_months: number | null;
  created_at: string;
  question_count?: number;
  assignment_stats?: { total: number; completed: number; passed: number };
}

export const TrainingSection = () => {
  const { companyId } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [assignCourseId, setAssignCourseId] = useState<string | null>(null);
  const [statusCourseId, setStatusCourseId] = useState<string | null>(null);
  const [publishDialogCourse, setPublishDialogCourse] = useState<Course | null>(null);

  const fetchCourses = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const { data: coursesData, error } = await supabase
        .from("training_courses")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch question counts and assignment stats
      const enriched = await Promise.all(
        (coursesData || []).map(async (c: any) => {
          const { count: qCount } = await supabase
            .from("training_questions")
            .select("*", { count: "exact", head: true })
            .eq("course_id", c.id);

          const { data: assignments } = await supabase
            .from("training_assignments")
            .select("completed_at, passed")
            .eq("course_id", c.id);

          const total = assignments?.length || 0;
          const completed = assignments?.filter((a: any) => a.completed_at).length || 0;
          const passed = assignments?.filter((a: any) => a.passed).length || 0;

          return {
            ...c,
            question_count: qCount || 0,
            assignment_stats: { total, completed, passed },
          };
        })
      );

      setCourses(enriched);
    } catch (err) {
      console.error("Error fetching courses:", err);
      toast.error("Kunne ikke hente kurs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCourses();
  }, [companyId]);

  const handleNewCourse = () => {
    setEditingCourseId(null);
    setEditorOpen(true);
  };

  const handleEditCourse = (id: string) => {
    setEditingCourseId(id);
    setEditorOpen(true);
  };

  const handleTogglePublish = async (course: Course) => {
    if (course.status === "published") {
      // Unpublish
      try {
        const { error } = await supabase
          .from("training_courses")
          .update({ status: "draft", available_to_all: false, updated_at: new Date().toISOString() })
          .eq("id", course.id);
        if (error) throw error;
        toast.success("Kurs satt til kladd");
        fetchCourses();
      } catch (err) {
        console.error("Error unpublishing:", err);
        toast.error("Kunne ikke oppdatere kursstatus");
      }
      return;
    }
    // Publishing — show choice dialog
    if ((course.question_count || 0) === 0) {
      toast.error("Kurset må ha minst ett spørsmål for å publiseres");
      return;
    }
    setPublishDialogCourse(course);
  };

  const handlePublishWithMode = async (mode: "all" | "specific") => {
    if (!publishDialogCourse) return;
    try {
      const { error } = await supabase
        .from("training_courses")
        .update({
          status: "published",
          available_to_all: mode === "all",
          updated_at: new Date().toISOString(),
        })
        .eq("id", publishDialogCourse.id);
      if (error) throw error;
      toast.success("Kurs publisert");
      if (mode === "specific") {
        setAssignCourseId(publishDialogCourse.id);
      }
      setPublishDialogCourse(null);
      fetchCourses();
    } catch (err) {
      console.error("Error publishing:", err);
      toast.error("Kunne ikke publisere kurs");
    }
  };

  const handleDeleteCourse = async (id: string) => {
    if (!confirm("Er du sikker på at du vil slette dette kurset? Alle spørsmål og tildelinger vil også bli slettet.")) return;
    try {
      const { error } = await supabase.from("training_courses").delete().eq("id", id);
      if (error) throw error;
      toast.success("Kurs slettet");
      fetchCourses();
    } catch (err) {
      console.error("Error deleting course:", err);
      toast.error("Kunne ikke slette kurs");
    }
  };

  if (editorOpen) {
    return (
      <TrainingCourseEditor
        courseId={editingCourseId}
        onClose={() => {
          setEditorOpen(false);
          fetchCourses();
        }}
      />
    );
  }

  if (statusCourseId) {
    const course = courses.find((c) => c.id === statusCourseId);
    return (
      <TrainingStatusView
        courseId={statusCourseId}
        courseTitle={course?.title || ""}
        onBack={() => setStatusCourseId(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Opplæring</h2>
          <p className="text-sm text-muted-foreground">Opprett kurs og tester for dine ansatte</p>
        </div>
        <Button onClick={handleNewCourse} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Nytt kurs
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Laster kurs...</p>
      ) : courses.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">Ingen kurs opprettet ennå</p>
            <Button onClick={handleNewCourse} className="mt-4" variant="outline">
              <Plus className="h-4 w-4 mr-1" />
              Opprett ditt første kurs
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <Card key={course.id} className="flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-tight">{course.title}</CardTitle>
                  <Badge variant={course.status === "published" ? "default" : "secondary"}>
                    {course.status === "published" ? "Publisert" : "Kladd"}
                  </Badge>
                </div>
                {course.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{course.description}</p>
                )}
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-between gap-3">
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>{course.question_count} spørsmål · Bestått: {course.passing_score}%</p>
                  <p>Gyldighet: {course.validity_months ? `${course.validity_months} mnd` : "Permanent"}</p>
                  {(course as any).available_to_all && course.status === "published" && (
                    <p className="text-primary flex items-center gap-1"><Globe className="h-3 w-3" /> Tilgjengelig for alle</p>
                  )}
                  {course.assignment_stats && course.assignment_stats.total > 0 && (
                    <p className="text-foreground">
                      {course.assignment_stats.passed}/{course.assignment_stats.total} bestått
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => handleEditCourse(course.id)}>
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleTogglePublish(course)}>
                    {course.status === "published" ? "Avpubliser" : "Publiser"}
                  </Button>
                  {course.status === "published" && (
                    <Button size="sm" variant="outline" onClick={() => setAssignCourseId(course.id)}>
                      <Users className="h-3.5 w-3.5 mr-1" />
                      Tildel
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setStatusCourseId(course.id)}>
                    <Eye className="h-3.5 w-3.5 mr-1" />
                    Status
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDeleteCourse(course.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {assignCourseId && (
        <TrainingAssignmentDialog
          courseId={assignCourseId}
          open={!!assignCourseId}
          onOpenChange={(open) => {
            if (!open) {
              setAssignCourseId(null);
              fetchCourses();
            }
          }}
        />
      )}

      {/* Publish mode dialog */}
      <Dialog open={!!publishDialogCourse} onOpenChange={(open) => { if (!open) setPublishDialogCourse(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Publiser kurs</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Hvordan skal kurset gjøres tilgjengelig?</p>
          <div className="grid gap-3 pt-2">
            <Button
              variant="outline"
              className="justify-start gap-3 h-auto py-3"
              onClick={() => handlePublishWithMode("all")}
            >
              <Globe className="h-5 w-5 text-primary shrink-0" />
              <div className="text-left">
                <p className="font-medium">Tilgjengelig for alle</p>
                <p className="text-xs text-muted-foreground">Alle ansatte kan ta kurset fra sitt personellkort</p>
              </div>
            </Button>
            <Button
              variant="outline"
              className="justify-start gap-3 h-auto py-3"
              onClick={() => handlePublishWithMode("specific")}
            >
              <UserCheck className="h-5 w-5 text-primary shrink-0" />
              <div className="text-left">
                <p className="font-medium">Tildel spesifikke personer</p>
                <p className="text-xs text-muted-foreground">Velg hvilke ansatte som skal ta kurset</p>
              </div>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
