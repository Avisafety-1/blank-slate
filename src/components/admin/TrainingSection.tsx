import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Eye, Users, Trash2, BookOpen, Globe, UserCheck, Play, FolderOpen, FolderPlus, Building2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { TrainingCourseEditor } from "./TrainingCourseEditor";
import { TrainingAssignmentDialog } from "./TrainingAssignmentDialog";
import { TrainingStatusView } from "./TrainingStatusView";
import { TakeCourseDialog } from "@/components/training/TakeCourseDialog";
import { CreateTrainingFolderDialog } from "@/components/training/CreateTrainingFolderDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Course {
  id: string;
  title: string;
  description: string | null;
  status: string;
  passing_score: number;
  validity_months: number | null;
  created_at: string;
  folder_id: string | null;
  global_visibility: boolean;
  company_id: string;
  question_count?: number;
  assignment_stats?: { total: number; completed: number; passed: number };
}

interface Folder {
  id: string;
  name: string;
  company_id: string;
  visible_to_children: boolean;
  inherited: boolean;
  course_count: number;
}

export const TrainingSection = () => {
  const { companyId, isSuperAdmin } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [assignCourseId, setAssignCourseId] = useState<string | null>(null);
  const [statusCourseId, setStatusCourseId] = useState<string | null>(null);
  const [publishDialogCourse, setPublishDialogCourse] = useState<Course | null>(null);
  const [previewCourseId, setPreviewCourseId] = useState<string | null>(null);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);

  const fetchFolders = async () => {
    if (!companyId) return;
    const { data, error } = await supabase
      .from("training_course_folders" as any)
      .select("id, name, company_id, visible_to_children")
      .order("created_at", { ascending: true });
    if (error) {
      console.error("Error fetching training folders:", error);
      return;
    }
    setFolders(
      (data || []).map((f: any) => ({
        ...f,
        inherited: f.company_id !== companyId,
        course_count: 0,
      }))
    );
  };

  const fetchCourses = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const { data: coursesData, error } = await supabase
        .from("training_courses")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

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

      // Update folder course counts
      setFolders((prev) =>
        prev.map((f) => ({
          ...f,
          course_count: enriched.filter((c) => c.folder_id === f.id).length,
        }))
      );
    } catch (err) {
      console.error("Error fetching courses:", err);
      toast.error("Kunne ikke hente kurs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFolders();
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
    if (!confirm("Er du sikker på at du vil slette dette kurset?")) return;
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

  const handleDeleteFolder = async (folderId: string) => {
    if (!confirm("Er du sikker på at du vil slette denne mappen? Kurs i mappen flyttes ut.")) return;
    try {
      // Unassign courses from the folder first
      const { error: moveErr } = await (supabase.from("training_courses") as any)
        .update({ folder_id: null })
        .eq("folder_id", folderId);
      if (moveErr) console.warn("Could not unassign courses:", moveErr);

      const { error } = await (supabase.from("training_course_folders") as any).delete().eq("id", folderId);
      if (error) throw error;
      toast.success("Mappe slettet");
      if (activeFolderId === folderId) setActiveFolderId(null);
      fetchFolders();
      fetchCourses();
    } catch (err) {
      console.error("Error deleting folder:", err);
      toast.error("Kunne ikke slette mappe");
    }
  };

  const handleMoveCourse = async (courseId: string, folderId: string | null) => {
    try {
      const { error } = await (supabase.from("training_courses") as any)
        .update({ folder_id: folderId })
        .eq("id", courseId);
      if (error) throw error;
      toast.success(folderId ? "Kurs flyttet til mappe" : "Kurs fjernet fra mappe");
      fetchCourses();
    } catch (err) {
      console.error("Error moving course:", err);
      toast.error("Kunne ikke flytte kurs");
    }
  };

  const handleToggleGlobal = async (course: Course) => {
    try {
      const { error } = await (supabase.from("training_courses") as any)
        .update({ global_visibility: !course.global_visibility })
        .eq("id", course.id);
      if (error) throw error;
      toast.success(course.global_visibility ? "Global deling deaktivert" : "Kurs delt med alle selskaper");
      fetchCourses();
    } catch (err) {
      console.error("Error toggling global:", err);
      toast.error("Kunne ikke oppdatere deling");
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

  // Filter courses by active folder
  const displayedCourses = activeFolderId
    ? courses.filter((c) => c.folder_id === activeFolderId)
    : courses.filter((c) => !c.folder_id);

  const activeFolder = folders.find((f) => f.id === activeFolderId);

  const renderCourseCard = (course: Course) => (
    <Card key={course.id} className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-tight">{course.title}</CardTitle>
          <div className="flex gap-1 shrink-0">
            {course.global_visibility && (
              <Badge variant="outline" className="text-primary border-primary/30">
                <Globe className="h-3 w-3 mr-1" />
                Global
              </Badge>
            )}
            <Badge variant={course.status === "published" ? "default" : "secondary"}>
              {course.status === "published" ? "Publisert" : "Kladd"}
            </Badge>
          </div>
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
          {(course.question_count || 0) > 0 && (
            <Button size="sm" variant="outline" onClick={() => setPreviewCourseId(course.id)}>
              <Play className="h-3.5 w-3.5 mr-1" />
              Preview
            </Button>
          )}
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
          {/* Folder move */}
          {folders.length > 0 && (
            <Select
              value={course.folder_id || "__none__"}
              onValueChange={(v) => handleMoveCourse(course.id, v === "__none__" ? null : v)}
            >
              <SelectTrigger className="h-8 w-8 p-0 [&>svg]:hidden border" title="Flytt til mappe">
                <FolderOpen className="h-3.5 w-3.5 mx-auto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Ingen mappe</SelectItem>
                {folders.filter((f) => !f.inherited).map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {/* Global visibility (superadmin only) */}
          {isSuperAdmin && (
            <Button
              size="sm"
              variant={course.global_visibility ? "default" : "ghost"}
              onClick={() => handleToggleGlobal(course)}
              title={course.global_visibility ? "Fjern global deling" : "Del med alle selskaper"}
            >
              <Globe className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDeleteCourse(course.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Opplæring</h2>
          <p className="text-sm text-muted-foreground">Opprett kurs og tester for dine ansatte</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setCreateFolderOpen(true)} size="sm" variant="outline">
            <FolderPlus className="h-4 w-4 mr-1" />
            Ny mappe
          </Button>
          <Button onClick={handleNewCourse} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Nytt kurs
          </Button>
        </div>
      </div>

      {/* Folder grid */}
      {!activeFolderId && folders.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {folders.map((folder) => (
            <div key={folder.id} className="relative group">
              <button
                onClick={() => setActiveFolderId(folder.id)}
                className="w-full rounded-lg border border-glass bg-card/80 backdrop-blur-md flex items-center gap-3 hover:bg-accent/15 transition-colors cursor-pointer p-3 sm:p-4 sm:flex-col sm:items-center sm:justify-center sm:aspect-square"
              >
                <div className="relative shrink-0">
                  <FolderOpen className="h-7 w-7 sm:h-9 sm:w-9 text-primary" />
                  {folder.inherited && (
                    <Building2 className="absolute -top-1 -right-1 h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex flex-col sm:items-center min-w-0">
                  <span className="text-sm sm:text-xs font-medium text-foreground text-left sm:text-center line-clamp-2 leading-tight">{folder.name}</span>
                  <span className="text-[11px] sm:text-[10px] text-muted-foreground">{folder.course_count} kurs</span>
                </div>
              </button>
              {!folder.inherited && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-destructive"
                  onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id); }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Active folder header */}
      {activeFolderId && activeFolder && (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setActiveFolderId(null)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <FolderOpen className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">{activeFolder.name}</h3>
          <Badge variant="secondary" className="text-xs">{displayedCourses.length} kurs</Badge>
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground text-sm">Laster kurs...</p>
      ) : displayedCourses.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">
              {activeFolderId ? "Ingen kurs i denne mappen" : "Ingen kurs uten mappe"}
            </p>
            <Button onClick={handleNewCourse} className="mt-4" variant="outline">
              <Plus className="h-4 w-4 mr-1" />
              {courses.length === 0 ? "Opprett ditt første kurs" : "Nytt kurs"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayedCourses.map((course) => renderCourseCard(course))}
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

      {previewCourseId && (
        <TakeCourseDialog
          courseId={previewCourseId}
          previewMode
          open={!!previewCourseId}
          onOpenChange={(open) => { if (!open) setPreviewCourseId(null); }}
        />
      )}

      <CreateTrainingFolderDialog
        open={createFolderOpen}
        onOpenChange={setCreateFolderOpen}
        onSuccess={() => { fetchFolders(); fetchCourses(); }}
      />
    </div>
  );
};
