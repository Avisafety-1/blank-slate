import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CheckCircle, XCircle, ChevronLeft, ChevronRight, Save, Maximize, Minimize } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { SlideReadonlyView } from "@/components/training/SlideReadonlyView";
import { SlideCanvasReadonly } from "@/components/training/SlideCanvasReadonly";

interface Props {
  assignmentId?: string;
  courseId?: string;
  previewMode?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: () => void;
}

interface SlideData {
  id: string;
  slide_type: string;
  question_text: string;
  content_json: any;
  image_url: string | null;
  sort_order: number;
  options: { id: string; option_text: string; is_correct: boolean; sort_order: number }[];
}

interface CourseData {
  id: string;
  title: string;
  description: string | null;
  passing_score: number;
  validity_months: number | null;
  display_mode: string;
  fullscreen: boolean;
}

export const TakeCourseDialog = ({ assignmentId, courseId: directCourseId, previewMode = false, open, onOpenChange, onCompleted }: Props) => {
  const { user, companyId } = useAuth();
  const [course, setCourse] = useState<CourseData | null>(null);
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [passed, setPassed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [savingProgress, setSavingProgress] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const isPaginated = course?.display_mode === "paginated";
  const questionSlides = slides.filter(s => s.slide_type === "question");

  useEffect(() => {
    if (open) loadCourse();
  }, [open, assignmentId, directCourseId]);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      dialogRef.current?.closest('[role="dialog"]')?.requestFullscreen?.();
    }
  }, []);

  const loadCourse = async () => {
    setLoading(true);
    setSubmitted(false);
    setScore(null);
    setCurrentPage(0);
    setAnswers({});
    try {
      let targetCourseId: string;

      if (previewMode && directCourseId) {
        targetCourseId = directCourseId;
      } else if (assignmentId) {
        const { data: assignment } = await supabase
          .from("training_assignments")
          .select("course_id, saved_answers")
          .eq("id", assignmentId)
          .single();

        if (!assignment) throw new Error("Assignment not found");
        targetCourseId = assignment.course_id;
        const savedAnswers = assignment.saved_answers as Record<string, string> | null;
        setAnswers(savedAnswers || {});
      } else {
        throw new Error("No assignment or course specified");
      }

      const { data: courseData } = await supabase
        .from("training_courses")
        .select("*")
        .eq("id", targetCourseId)
        .single();

      setCourse({ ...courseData, fullscreen: (courseData as any)?.fullscreen || false } as CourseData);

      if ((courseData as any)?.fullscreen && !previewMode) {
        setTimeout(() => {
          dialogRef.current?.closest('[role="dialog"]')?.requestFullscreen?.();
        }, 300);
      }

      const { data: questionsData } = await supabase
        .from("training_questions")
        .select("*")
        .eq("course_id", targetCourseId)
        .order("sort_order");

      if (questionsData && questionsData.length > 0) {
        const qIds = questionsData.map((q: any) => q.id);
        const { data: optionsData } = await supabase
          .from("training_question_options")
          .select("*")
          .in("question_id", qIds)
          .order("sort_order");

        const loadedSlides: SlideData[] = questionsData.map((q: any) => ({
          id: q.id,
          slide_type: q.slide_type || "question",
          question_text: q.question_text,
          content_json: q.content_json || null,
          image_url: q.image_url,
          sort_order: q.sort_order,
          options: (optionsData || []).filter((o: any) => o.question_id === q.id),
        }));
        setSlides(loadedSlides);

        if (!previewMode && assignmentId) {
          const savedAnswers = answers;
          if (savedAnswers && (courseData as any)?.display_mode === "paginated") {
            const firstUnanswered = loadedSlides.findIndex((s) => s.slide_type === "question" && !savedAnswers[s.id]);
            if (firstUnanswered > 0) setCurrentPage(firstUnanswered);
          }
        }
      }
    } catch (err) {
      console.error("Error loading course:", err);
      toast.error("Kunne ikke laste kurset");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProgress = async () => {
    setSavingProgress(true);
    try {
      const { error } = await supabase
        .from("training_assignments")
        .update({ saved_answers: answers as any })
        .eq("id", assignmentId);
      if (error) throw error;
      toast.success("Fremgang lagret");
    } catch (err) {
      console.error("Error saving progress:", err);
      toast.error("Kunne ikke lagre fremgang");
    } finally {
      setSavingProgress(false);
    }
  };

  const handleSaveAndClose = async () => {
    await handleSaveProgress();
    onOpenChange(false);
  };

  const handleSelectAnswer = (questionId: string, optionId: string) => {
    const newAnswers = { ...answers, [questionId]: optionId };
    setAnswers(newAnswers);

    if (isPaginated && currentPage < slides.length - 1) {
      setTimeout(() => setCurrentPage((p) => p + 1), 350);
    }
  };

  const handleSubmit = async () => {
    if (!course) return;

    const unanswered = questionSlides.filter((q) => !answers[q.id]);
    if (unanswered.length > 0) {
      toast.error(`Du må svare på alle ${questionSlides.length} spørsmål`);
      if (isPaginated) {
        const firstIdx = slides.findIndex((s) => s.slide_type === "question" && !answers[s.id]);
        setCurrentPage(firstIdx);
      }
      return;
    }

    if (previewMode) {
      let correct = 0;
      questionSlides.forEach((q) => {
        const selectedOptionId = answers[q.id];
        const correctOption = q.options.find((o) => o.is_correct);
        if (correctOption && correctOption.id === selectedOptionId) correct++;
      });
      const scorePercent = questionSlides.length > 0 ? Math.round((correct / questionSlides.length) * 100) : 100;
      setScore(scorePercent);
      setPassed(scorePercent >= course.passing_score);
      setSubmitted(true);
      return;
    }

    if (!user) return;

    setSubmitting(true);
    try {
      let correct = 0;
      questionSlides.forEach((q) => {
        const selectedOptionId = answers[q.id];
        const correctOption = q.options.find((o) => o.is_correct);
        if (correctOption && correctOption.id === selectedOptionId) correct++;
      });

      const scorePercent = questionSlides.length > 0 ? Math.round((correct / questionSlides.length) * 100) : 100;
      const didPass = scorePercent >= course.passing_score;

      setScore(scorePercent);
      setPassed(didPass);
      setSubmitted(true);

      const updatePayload: any = {
        completed_at: new Date().toISOString(),
        score: scorePercent,
        passed: didPass,
        saved_answers: null,
      };

      if (didPass) {
        const now = new Date();
        const expiresAt = course.validity_months
          ? new Date(now.getFullYear(), now.getMonth() + course.validity_months, now.getDate())
          : null;

        try {
          const { data: compData, error: compErr } = await supabase
            .from("personnel_competencies")
            .insert({
              profile_id: user.id,
              type: "Kurs",
              navn: course.title,
              utstedt_dato: now.toISOString().split("T")[0],
              utloper_dato: expiresAt ? expiresAt.toISOString().split("T")[0] : null,
              påvirker_status: true,
            })
            .select("id")
            .single();

          if (!compErr && compData) {
            updatePayload.competency_id = compData.id;
          }
        } catch (compError) {
          console.error("Error creating competency:", compError);
        }
      }

      const { error: updateError } = await supabase
        .from("training_assignments")
        .update(updatePayload)
        .eq("id", assignmentId);

      if (updateError) {
        console.error("Error updating assignment:", updateError);
      }
    } catch (err) {
      console.error("Error submitting:", err);
      toast.error("Kunne ikke fullføre kurset");
      setSubmitted(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseResults = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    onOpenChange(false);
    if (!previewMode) onCompleted?.();
  };

  const handleClose = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    onOpenChange(false);
  };

  const answeredCount = questionSlides.filter((q) => answers[q.id]).length;
  const progressPercent = questionSlides.length > 0 ? Math.round((answeredCount / questionSlides.length) * 100) : 0;

  const renderSlide = (s: SlideData, idx: number) => {
    if (s.slide_type === "content") {
      return (
        <Card key={s.id}>
          <CardContent className="pt-4">
            {s.content_json ? (
              s.content_json.elements ? (
                <SlideCanvasReadonly data={s.content_json} />
              ) : (
                <SlideReadonlyView content={s.content_json} />
              )
            ) : (
              <p className="text-muted-foreground text-sm">Innholdsside</p>
            )}
          </CardContent>
        </Card>
      );
    }

    // Question slide
    return (
      <Card key={s.id}>
        <CardContent className="pt-4 space-y-3">
          {s.content_json ? (
            <SlideReadonlyView content={s.content_json} />
          ) : (
            <p className="font-medium">
              <span className="text-muted-foreground mr-2">{questionSlides.indexOf(s) + 1}.</span>
              {s.question_text}
            </p>
          )}
          {s.image_url && (
            <img src={s.image_url} alt="" className={`${isFullscreen ? "max-h-[60vh]" : "max-h-48"} rounded object-contain`} />
          )}
          <RadioGroup
            value={answers[s.id] || ""}
            onValueChange={(v) => handleSelectAnswer(s.id, v)}
          >
            {s.options.map((o) => (
              <div key={o.id} className="flex items-center gap-2">
                <RadioGroupItem value={o.id} id={o.id} />
                <Label htmlFor={o.id} className="cursor-pointer text-sm">{o.option_text}</Label>
              </div>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>
    );
  };

  const renderResultView = () => (
    <div className="text-center py-8 space-y-4">
      {previewMode && (
        <Badge variant="secondary" className="mb-2">Forhåndsvisning</Badge>
      )}
      {passed ? (
        <CheckCircle className="h-16 w-16 text-primary mx-auto" />
      ) : (
        <XCircle className="h-16 w-16 text-destructive mx-auto" />
      )}
      <h3 className="text-2xl font-bold">{score}%</h3>
      <p className="text-lg">
        {passed ? "Gratulerer! Du har bestått kurset." : "Dessverre, du bestod ikke denne gangen."}
      </p>
      <p className="text-sm text-muted-foreground">
        Krav: {course?.passing_score}% · Din score: {score}%
      </p>
      {!previewMode && passed && course?.validity_months && (
        <Badge variant="default">
          Gyldig i {course.validity_months} måneder
        </Badge>
      )}
      {!previewMode && passed && (
        <p className="text-sm text-muted-foreground">
          Kurset er lagret som kompetanse på din profil.
        </p>
      )}
      {previewMode && (
        <p className="text-sm text-muted-foreground">
          Dette er en forhåndsvisning — ingen data er lagret.
        </p>
      )}
      <Button onClick={handleCloseResults} className="mt-4">
        Lukk
      </Button>
    </div>
  );

  const renderPaginatedView = () => {
    const s = slides[currentPage];
    if (!s) return null;

    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Side {currentPage + 1} av {slides.length}</span>
            <span>{answeredCount}/{questionSlides.length} besvart</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>

        {renderSlide(s, currentPage)}

        <div className="flex items-center justify-between sticky bottom-0 bg-background/80 backdrop-blur-sm p-3 rounded-lg border">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 0}
              onClick={() => setCurrentPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Forrige
            </Button>
            {currentPage < slides.length - 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => p + 1)}
              >
                Neste
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {!previewMode && (
              <Button variant="ghost" size="sm" onClick={handleSaveAndClose} disabled={savingProgress}>
                <Save className="h-4 w-4 mr-1" />
                {savingProgress ? "Lagrer..." : "Lagre og lukk"}
              </Button>
            )}
            {previewMode && (
              <Button variant="ghost" size="sm" onClick={handleClose}>
                Lukk
              </Button>
            )}
            {answeredCount === questionSlides.length && questionSlides.length > 0 && (
              <Button size="sm" onClick={handleSubmit} disabled={submitting}>
                {submitting ? "Fullfører..." : "Fullfør"}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderListView = () => (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{answeredCount} av {questionSlides.length} besvart</span>
        </div>
        <Progress value={progressPercent} className="h-2" />
      </div>

      {slides.map((s, idx) => renderSlide(s, idx))}

      <div className="flex justify-end gap-2 sticky bottom-0 bg-background/80 backdrop-blur-sm p-3 rounded-lg border">
        {!previewMode && (
          <Button variant="ghost" onClick={handleSaveAndClose} disabled={savingProgress}>
            <Save className="h-4 w-4 mr-1" />
            {savingProgress ? "Lagrer..." : "Lagre og lukk"}
          </Button>
        )}
        <Button variant="outline" onClick={handleClose}>
          {previewMode ? "Lukk" : "Avbryt"}
        </Button>
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Fullfører..." : "Fullfør"}
        </Button>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent ref={dialogRef} className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <DialogTitle className="truncate">{course?.title || "Kurs"}</DialogTitle>
              {previewMode && <Badge variant="secondary" className="shrink-0">Forhåndsvisning</Badge>}
            </div>
            <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={toggleFullscreen}>
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </Button>
          </div>
          {course?.description && <p className="text-sm text-muted-foreground">{course.description}</p>}
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Laster kurs...</p>
        ) : submitted ? (
          renderResultView()
        ) : isPaginated ? (
          renderPaginatedView()
        ) : (
          renderListView()
        )}
      </DialogContent>
    </Dialog>
  );
};
