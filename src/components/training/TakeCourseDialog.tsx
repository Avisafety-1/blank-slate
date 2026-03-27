import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CheckCircle, XCircle, ChevronLeft, ChevronRight, Save } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface Props {
  assignmentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: () => void;
}

interface Question {
  id: string;
  question_text: string;
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
}

export const TakeCourseDialog = ({ assignmentId, open, onOpenChange, onCompleted }: Props) => {
  const { user, companyId } = useAuth();
  const [course, setCourse] = useState<CourseData | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [passed, setPassed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [savingProgress, setSavingProgress] = useState(false);

  const isPaginated = course?.display_mode === "paginated";

  useEffect(() => {
    if (open) loadCourse();
  }, [open, assignmentId]);

  const loadCourse = async () => {
    setLoading(true);
    setSubmitted(false);
    setScore(null);
    setCurrentPage(0);
    try {
      const { data: assignment } = await supabase
        .from("training_assignments")
        .select("course_id, saved_answers")
        .eq("id", assignmentId)
        .single();

      if (!assignment) throw new Error("Assignment not found");

      // Restore saved answers if any
      const savedAnswers = assignment.saved_answers as Record<string, string> | null;
      setAnswers(savedAnswers || {});

      const { data: courseData } = await supabase
        .from("training_courses")
        .select("*")
        .eq("id", assignment.course_id)
        .single();

      setCourse(courseData as CourseData);

      const { data: questionsData } = await supabase
        .from("training_questions")
        .select("*")
        .eq("course_id", assignment.course_id)
        .order("sort_order");

      if (questionsData && questionsData.length > 0) {
        const qIds = questionsData.map((q: any) => q.id);
        const { data: optionsData } = await supabase
          .from("training_question_options")
          .select("*")
          .in("question_id", qIds)
          .order("sort_order");

        const qs = questionsData.map((q: any) => ({
          ...q,
          options: (optionsData || []).filter((o: any) => o.question_id === q.id),
        }));
        setQuestions(qs);

        // If we have saved answers, jump to first unanswered question in paginated mode
        if (savedAnswers && (courseData as any)?.display_mode === "paginated") {
          const firstUnanswered = qs.findIndex((q: Question) => !savedAnswers[q.id]);
          if (firstUnanswered > 0) setCurrentPage(firstUnanswered);
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

    // In paginated mode, auto-advance after a short delay
    if (isPaginated && currentPage < questions.length - 1) {
      setTimeout(() => setCurrentPage((p) => p + 1), 350);
    }
  };

  const handleSubmit = async () => {
    if (!course || !user) return;

    const unanswered = questions.filter((q) => !answers[q.id]);
    if (unanswered.length > 0) {
      toast.error(`Du må svare på alle ${questions.length} spørsmål`);
      if (isPaginated) {
        const firstIdx = questions.findIndex((q) => !answers[q.id]);
        setCurrentPage(firstIdx);
      }
      return;
    }

    setSubmitting(true);
    try {
      let correct = 0;
      questions.forEach((q) => {
        const selectedOptionId = answers[q.id];
        const correctOption = q.options.find((o) => o.is_correct);
        if (correctOption && correctOption.id === selectedOptionId) correct++;
      });

      const scorePercent = Math.round((correct / questions.length) * 100);
      const didPass = scorePercent >= course.passing_score;

      // Show results first
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
    onOpenChange(false);
    onCompleted?.();
  };

  const answeredCount = questions.filter((q) => answers[q.id]).length;
  const progressPercent = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;

  const renderQuestion = (q: Question, idx: number) => (
    <Card key={q.id}>
      <CardContent className="pt-4 space-y-3">
        <p className="font-medium">
          <span className="text-muted-foreground mr-2">{idx + 1}.</span>
          {q.question_text}
        </p>
        {q.image_url && (
          <img src={q.image_url} alt="" className="max-h-48 rounded object-contain" />
        )}
        <RadioGroup
          value={answers[q.id] || ""}
          onValueChange={(v) => handleSelectAnswer(q.id, v)}
        >
          {q.options.map((o) => (
            <div key={o.id} className="flex items-center gap-2">
              <RadioGroupItem value={o.id} id={o.id} />
              <Label htmlFor={o.id} className="cursor-pointer text-sm">{o.option_text}</Label>
            </div>
          ))}
        </RadioGroup>
      </CardContent>
    </Card>
  );

  const renderResultView = () => (
    <div className="text-center py-8 space-y-4">
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
      {passed && course?.validity_months && (
        <Badge variant="default">
          Gyldig i {course.validity_months} måneder
        </Badge>
      )}
      {passed && (
        <p className="text-sm text-muted-foreground">
          Kurset er lagret som kompetanse på din profil.
        </p>
      )}
      <Button onClick={handleCloseResults} className="mt-4">
        Lukk
      </Button>
    </div>
  );

  const renderPaginatedView = () => {
    const q = questions[currentPage];
    if (!q) return null;

    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Spørsmål {currentPage + 1} av {questions.length}</span>
            <span>{answeredCount} besvart</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>

        {renderQuestion(q, currentPage)}

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
            {currentPage < questions.length - 1 && (
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
            <Button variant="ghost" size="sm" onClick={handleSaveAndClose} disabled={savingProgress}>
              <Save className="h-4 w-4 mr-1" />
              {savingProgress ? "Lagrer..." : "Lagre og lukk"}
            </Button>
            {answeredCount === questions.length && (
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
          <span>{answeredCount} av {questions.length} besvart</span>
        </div>
        <Progress value={progressPercent} className="h-2" />
      </div>

      {questions.map((q, idx) => renderQuestion(q, idx))}

      <div className="flex justify-end gap-2 sticky bottom-0 bg-background/80 backdrop-blur-sm p-3 rounded-lg border">
        <Button variant="ghost" onClick={handleSaveAndClose} disabled={savingProgress}>
          <Save className="h-4 w-4 mr-1" />
          {savingProgress ? "Lagrer..." : "Lagre og lukk"}
        </Button>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Avbryt
        </Button>
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Fullfører..." : "Fullfør"}
        </Button>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{course?.title || "Kurs"}</DialogTitle>
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
