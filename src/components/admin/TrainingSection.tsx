import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Eye, Users, Trash2, BookOpen, Globe, UserCheck, Play, FolderOpen, FolderPlus, Building2, ArrowLeft, ArrowDown, ArrowUp, Sparkles, Compass } from "lucide-react";
import { toast } from "sonner";
import { TrainingCourseEditor } from "./TrainingCourseEditor";
import { TrainingAssignmentDialog } from "./TrainingAssignmentDialog";
import { TrainingStatusView } from "./TrainingStatusView";
import { TakeCourseDialog } from "@/components/training/TakeCourseDialog";
import { CreateTrainingFolderDialog } from "@/components/training/CreateTrainingFolderDialog";
import { AICourseGeneratorDialog } from "@/components/training/AICourseGeneratorDialog";
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
  visible_to_children: boolean;
  shared_with_parent: boolean;
  company_id: string;
  company_name?: string;
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
  const { t } = useTranslation();
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
  const [aiGenOpen, setAiGenOpen] = useState(false);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [hasChildren, setHasChildren] = useState(false);
  const [hasParent, setHasParent] = useState(false);

  // Detect parent/children of active company
  useEffect(() => {
    if (!companyId) return;
    (async () => {
      const [{ data: parent }, { count: childCount }] = await Promise.all([
        supabase.from("companies").select("parent_company_id").eq("id", companyId).maybeSingle(),
        supabase.from("companies").select("id", { count: "exact", head: true }).eq("parent_company_id", companyId),
      ]);
      setHasParent(!!parent?.parent_company_id);
      setHasChildren((childCount || 0) > 0);
    })();
  }, [companyId]);

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
        .select("*, companies(navn)")
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
            company_name: (c as any).companies?.navn,
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
      toast.error(t("training.section.toastFetchCoursesFailed"));
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
        toast.success(t("training.section.toastCourseSetDraft"));
        fetchCourses();
      } catch (err) {
        console.error("Error unpublishing:", err);
        toast.error(t("training.section.toastCourseUnpublishFailed"));
      }
      return;
    }
    const isGuidedTour = (course as any).display_mode === "guided_tour" || !!(course as any).tour_id;
    if (!isGuidedTour && (course.question_count || 0) === 0) {
      toast.error(t("training.section.toastQuestionRequired"));
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
      toast.success(t("training.section.toastCoursePublished"));
      if (mode === "specific") {
        setAssignCourseId(publishDialogCourse.id);
      }
      setPublishDialogCourse(null);
      fetchCourses();
    } catch (err) {
      console.error("Error publishing:", err);
      toast.error(t("training.section.toastPublishFailed"));
    }
  };

  const handleDeleteCourse = async (id: string) => {
    if (!confirm(t("training.section.confirmDeleteCourse"))) return;
    try {
      const { error } = await supabase.from("training_courses").delete().eq("id", id);
      if (error) throw error;
      toast.success(t("training.section.toastCourseDeleted"));
      fetchCourses();
    } catch (err) {
      console.error("Error deleting course:", err);
      toast.error(t("training.section.toastDeleteCourseFailed"));
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (!confirm(t("training.section.confirmDeleteFolder"))) return;
    try {
      // Unassign courses from the folder first
      const { error: moveErr } = await (supabase.from("training_courses") as any)
        .update({ folder_id: null })
        .eq("folder_id", folderId);
      if (moveErr) console.warn("Could not unassign courses:", moveErr);

      const { error } = await (supabase.from("training_course_folders") as any).delete().eq("id", folderId);
      if (error) throw error;
      toast.success(t("training.section.toastFolderDeleted"));
      if (activeFolderId === folderId) setActiveFolderId(null);
      fetchFolders();
      fetchCourses();
    } catch (err) {
      console.error("Error deleting folder:", err);
      toast.error(t("training.section.toastDeleteFolderFailed"));
    }
  };

  const handleMoveCourse = async (courseId: string, folderId: string | null) => {
    try {
      const { error } = await (supabase.from("training_courses") as any)
        .update({ folder_id: folderId })
        .eq("id", courseId);
      if (error) throw error;
      toast.success(folderId ? t("training.section.toastCourseMovedToFolder") : t("training.section.toastCourseRemovedFromFolder"));
      fetchCourses();
    } catch (err) {
      console.error("Error moving course:", err);
      toast.error(t("training.section.toastMoveCourseFailed"));
    }
  };

  const handleToggleGlobal = async (course: Course) => {
    try {
      const { error } = await (supabase.from("training_courses") as any)
        .update({ global_visibility: !course.global_visibility })
        .eq("id", course.id);
      if (error) throw error;
      toast.success(course.global_visibility ? t("training.section.toastGlobalDisabled") : t("training.section.toastGlobalEnabled"));
      fetchCourses();
    } catch (err) {
      console.error("Error toggling global:", err);
      toast.error(t("training.section.toastToggleGlobalFailed"));
    }
  };

  const handleToggleVisibleToChildren = async (course: Course) => {
    try {
      const { error } = await (supabase.from("training_courses") as any)
        .update({ visible_to_children: !course.visible_to_children })
        .eq("id", course.id);
      if (error) throw error;
      toast.success(course.visible_to_children ? t("training.section.toastChildrenSharingDisabled") : t("training.section.toastChildrenSharingEnabled"));
      fetchCourses();
    } catch (err) {
      console.error("Error toggling visible_to_children:", err);
      toast.error(t("training.section.toastToggleGlobalFailed"));
    }
  };

  const handleToggleSharedWithParent = async (course: Course) => {
    try {
      const { error } = await (supabase.from("training_courses") as any)
        .update({ shared_with_parent: !course.shared_with_parent })
        .eq("id", course.id);
      if (error) throw error;
      toast.success(course.shared_with_parent ? t("training.section.toastParentSharingDisabled") : t("training.section.toastParentSharingEnabled"));
      fetchCourses();
    } catch (err) {
      console.error("Error toggling shared_with_parent:", err);
      toast.error(t("training.section.toastToggleGlobalFailed"));
    }
  };

  const handleToggleFolderVisibleToChildren = async (folder: Folder) => {
    try {
      const { error } = await (supabase.from("training_course_folders") as any)
        .update({ visible_to_children: !folder.visible_to_children })
        .eq("id", folder.id);
      if (error) throw error;
      toast.success(folder.visible_to_children ? t("training.section.toastFolderSharingDisabled") : t("training.section.toastFolderSharingEnabled"));
      fetchFolders();
    } catch (err) {
      console.error("Error toggling folder visible_to_children:", err);
      toast.error(t("training.section.toastFolderSharingFailed"));
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

  const renderCourseCard = (course: Course) => {
    const isOwner = course.company_id === companyId;
    return (
    <Card key={course.id} className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap gap-1 mb-2">
          {course.global_visibility && (
            <Badge variant="outline" className="text-primary border-primary/30">
              <Globe className="h-3 w-3 mr-1" />
              {t("training.section.global")}
            </Badge>
          )}
          {!isOwner && (
            <Badge variant="outline" className="border-muted-foreground/30">
              <Building2 className="h-3 w-3 mr-1" />
              {course.company_name ? t("training.section.inheritedFrom", { name: course.company_name }) : t("training.section.inherited")}
            </Badge>
          )}
          {course.visible_to_children && (isOwner || course.shared_with_parent) && (
            <Badge variant="outline" className="border-primary/30 text-primary">
              <ArrowDown className="h-3 w-3 mr-1" />
              {t("training.section.sharedDown")}
            </Badge>
          )}
          {isOwner && course.shared_with_parent && (
            <Badge variant="outline" className="border-primary/30 text-primary">
              <ArrowUp className="h-3 w-3 mr-1" />
              {t("training.section.sharedWithParent")}
            </Badge>
          )}
          {((course as any).display_mode === "guided_tour" || (course as any).tour_id) && (
            <Badge variant="outline" className="border-primary/40 text-primary bg-primary/5">
              <Compass className="h-3 w-3 mr-1" />
              {t("training.section.guidedTour")}
            </Badge>
          )}
          <Badge variant={course.status === "published" ? "default" : "secondary"}>
            {course.status === "published" ? t("training.section.published") : t("training.section.draft")}
          </Badge>
        </div>
        <CardTitle className="text-base leading-tight">{course.title}</CardTitle>
        {course.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{course.description}</p>
        )}
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-between gap-3">
        <div className="text-xs text-muted-foreground space-y-1">
          <p>{t("training.section.questionsAndPassing", { count: course.question_count, score: course.passing_score })}</p>
          <p>{t("training.section.validity", { validity: course.validity_months ? t("training.section.monthsShort", { count: course.validity_months }) : t("training.section.permanent") })}</p>
          {(course as any).available_to_all && course.status === "published" && (
            <p className="text-primary flex items-center gap-1"><Globe className="h-3 w-3" /> {t("training.section.availableToAll")}</p>
          )}
          {course.assignment_stats && course.assignment_stats.total > 0 && (
            <p className="text-foreground">
              {t("training.section.passedStats", { passed: course.assignment_stats.passed, total: course.assignment_stats.total })}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {isOwner && (
            <Button size="sm" variant="outline" onClick={() => handleEditCourse(course.id)}>
              <Edit className="h-3.5 w-3.5" />
            </Button>
          )}
          {(course.question_count || 0) > 0 && (
            <Button size="sm" variant="outline" onClick={() => setPreviewCourseId(course.id)}>
              <Play className="h-3.5 w-3.5 mr-1" />
              {t("training.section.preview")}
            </Button>
          )}
          {isOwner && (
            <Button size="sm" variant="outline" onClick={() => handleTogglePublish(course)}>
              {course.status === "published" ? t("training.section.unpublish") : t("training.section.publish")}
            </Button>
          )}
          {course.status === "published" && (
            <Button size="sm" variant="outline" onClick={() => setAssignCourseId(course.id)}>
              <Users className="h-3.5 w-3.5 mr-1" />
              {t("training.section.assign")}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setStatusCourseId(course.id)}>
            <Eye className="h-3.5 w-3.5 mr-1" />
            {t("training.section.status")}
          </Button>
          {/* Folder move */}
          {isOwner && folders.length > 0 && (
            <Select
              value={course.folder_id || "__none__"}
              onValueChange={(v) => handleMoveCourse(course.id, v === "__none__" ? null : v)}
            >
              <SelectTrigger className="h-8 w-8 p-0 [&>svg.lucide-chevron-down]:hidden border flex items-center justify-center" title={t("training.section.moveToFolder")}>
                <FolderOpen className="h-4 w-4" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t("training.section.noFolder")}</SelectItem>
                {folders.filter((f) => !f.inherited).map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {/* Share with children: owner with children, OR parent viewing a course shared up from a child */}
          {hasChildren && (isOwner || course.shared_with_parent) && (
            <Button
              size="sm"
              variant={course.visible_to_children ? "default" : "ghost"}
              onClick={() => handleToggleVisibleToChildren(course)}
              title={course.visible_to_children ? t("training.section.stopSharingWithChildren") : t("training.section.shareWithChildren")}
            >
              <ArrowDown className="h-3.5 w-3.5 mr-1" />
              {course.visible_to_children ? t("training.section.sharedDown") : t("training.section.shareWithChildren")}
            </Button>
          )}
          {/* Share with parent (owner + has parent) */}
          {isOwner && hasParent && (
            <Button
              size="sm"
              variant={course.shared_with_parent ? "default" : "ghost"}
              onClick={() => handleToggleSharedWithParent(course)}
              title={course.shared_with_parent ? t("training.section.stopSharingWithParent") : t("training.section.shareWithParent")}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
          )}
          {/* Global visibility (superadmin only) */}
          {isSuperAdmin && isOwner && (
            <Button
              size="sm"
              variant={course.global_visibility ? "default" : "ghost"}
              onClick={() => handleToggleGlobal(course)}
              title={course.global_visibility ? t("training.section.removeGlobalSharing") : t("training.section.shareWithAllCompanies")}
            >
              <Globe className="h-3.5 w-3.5" />
            </Button>
          )}
          {isOwner && (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDeleteCourse(course.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">{t("training.section.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("training.section.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setAiGenOpen(true)} size="sm" variant="outline" className="border-primary/40 text-primary hover:bg-primary/10">
            <Sparkles className="h-4 w-4 mr-1" />
            {t("training.section.generateWithAi")}
          </Button>
          <Button onClick={() => setCreateFolderOpen(true)} size="sm" variant="outline">
            <FolderPlus className="h-4 w-4 mr-1" />
            {t("training.section.newFolder")}
          </Button>
          <Button onClick={handleNewCourse} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            {t("training.section.newCourse")}
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
                  <span className="text-[11px] sm:text-[10px] text-muted-foreground">{t("training.section.coursesCount", { count: folder.course_count })}</span>
                </div>
              </button>
              {!folder.inherited && (
                <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100">
                  {hasChildren && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className={`h-6 w-6 p-0 ${folder.visible_to_children ? "text-primary" : "text-muted-foreground"}`}
                      onClick={(e) => { e.stopPropagation(); handleToggleFolderVisibleToChildren(folder); }}
                      title={folder.visible_to_children ? t("training.section.stopSharingFolderWithChildren") : t("training.section.shareFolderWithChildren")}
                    >
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 text-destructive"
                    onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id); }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              )}
              {!folder.inherited && folder.visible_to_children && (
                <Badge variant="outline" className="absolute bottom-1 right-1 text-[9px] h-4 px-1 border-primary/30 text-primary">
                  <ArrowDown className="h-2.5 w-2.5" />
                </Badge>
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
          <Badge variant="secondary" className="text-xs">{t("training.section.coursesCount", { count: displayedCourses.length })}</Badge>
          {!activeFolder.inherited && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                // Show courses not in any folder
                const available = courses.filter(c => !c.folder_id);
                if (available.length === 0) {
                  toast.info(t("training.section.noCoursesAvailableOutsideFolders"));
                  return;
                }
                const courseNames = available.map(c => c.title).join("\n");
                // Simple multi-select via prompt isn't great, use a loop approach
                const selected = prompt(t("training.section.addCoursePrompt", { folder: activeFolder.name, courses: courseNames }));
                if (selected) {
                  const match = available.find(c => c.title.toLowerCase().includes(selected.toLowerCase()));
                  if (match) {
                    handleMoveCourse(match.id, activeFolderId);
                  } else {
                    toast.error(t("training.section.courseNotFound"));
                  }
                }
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              {t("training.section.addCourseToFolder")}
            </Button>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground text-sm">{t("training.section.loadingCourses")}</p>
      ) : displayedCourses.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">
              {activeFolderId ? t("training.section.noCoursesInFolder") : t("training.section.noCoursesWithoutFolder")}
            </p>
            <Button onClick={handleNewCourse} className="mt-4" variant="outline">
              <Plus className="h-4 w-4 mr-1" />
              {courses.length === 0 ? t("training.section.createFirstCourse") : t("training.section.newCourse")}
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
            <DialogTitle>{t("training.section.publishDialogTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("training.section.publishDialogQuestion")}</p>
          <div className="grid gap-3 pt-2">
            <Button
              variant="outline"
              className="justify-start gap-3 h-auto py-3"
              onClick={() => handlePublishWithMode("all")}
            >
              <Globe className="h-5 w-5 text-primary shrink-0" />
              <div className="text-left">
                <p className="font-medium">{t("training.section.publishAllTitle")}</p>
                <p className="text-xs text-muted-foreground">{t("training.section.publishAllDesc")}</p>
              </div>
            </Button>
            <Button
              variant="outline"
              className="justify-start gap-3 h-auto py-3"
              onClick={() => handlePublishWithMode("specific")}
            >
              <UserCheck className="h-5 w-5 text-primary shrink-0" />
              <div className="text-left">
                <p className="font-medium">{t("training.section.publishSpecificTitle")}</p>
                <p className="text-xs text-muted-foreground">{t("training.section.publishSpecificDesc")}</p>
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

      <AICourseGeneratorDialog
        open={aiGenOpen}
        onOpenChange={setAiGenOpen}
        folders={folders.map((f) => ({ id: f.id, name: f.name }))}
        initialFolderId={activeFolderId}
        onCourseCreated={(_courseId) => {
          fetchCourses();
          toast.success(t("training.section.toastCourseCreated"));
        }}
      />
    </div>
  );
};
