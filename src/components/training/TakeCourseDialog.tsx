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
import { CheckCircle, XCircle } from "lucide-react";

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

  useEffect(() => {
    if (open) loadCourse();
  }, [open, assignmentId]);

  const loadCourse = async () => {
    setLoading(true);
    setSubmitted(false);
    setScore(null);
    setAnswers({});
    try {
      // Get assignment to find course_id
      const { data: assignment } = await supabase
        .from("training_assignments")
        .select("course_id")
        .eq("id", assignmentId)
        .single();

      if (!assignment) throw new Error("Assignment not found");

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

        setQuestions(
          questionsData.map((q: any) => ({
            ...q,
            options: (optionsData || []).filter((o: any) => o.question_id === q.id),
          }))
        );
      }
    } catch (err) {
      console.error("Error loading course:", err);
      toast.error("Kunne ikke laste kurset");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!course || !user) return;

    // Check all questions answered
    const unanswered = questions.filter((q) => !answers[q.id]);
    if (unanswered.length > 0) {
      toast.error(`Du må svare på alle ${questions.length} spørsmål`);
      return;
    }

    setSubmitting(true);
    try {
      // Calculate score
      let correct = 0;
      questions.forEach((q) => {
        const selectedOptionId = answers[q.id];
        const correctOption = q.options.find((o) => o.is_correct);
        if (correctOption && correctOption.id === selectedOptionId) correct++;
      });

      const scorePercent = Math.round((correct / questions.length) * 100);
      const didPass = scorePercent >= course.passing_score;

      setScore(scorePercent);
      setPassed(didPass);
      setSubmitted(true);

      // Update assignment
      const updatePayload: any = {
        completed_at: new Date().toISOString(),
        score: scorePercent,
        passed: didPass,
      };

      // If passed, create competency
      if (didPass) {
        const now = new Date();
        const expiresAt = course.validity_months
          ? new Date(now.getFullYear(), now.getMonth() + course.validity_months, now.getDate())
          : null;

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
      }

      await supabase.from("training_assignments").update(updatePayload).eq("id", assignmentId);

      onCompleted?.();
    } catch (err) {
      console.error("Error submitting:", err);
      toast.error("Kunne ikke sende inn besvarelsen");
    } finally {
      setSubmitting(false);
    }
  };

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
            <Button onClick={() => onOpenChange(false)} className="mt-4">
              Lukk
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {questions.map((q, idx) => (
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
                    onValueChange={(v) => setAnswers({ ...answers, [q.id]: v })}
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
            ))}

            <div className="flex justify-end gap-2 sticky bottom-0 bg-background/80 backdrop-blur-sm p-3 rounded-lg border">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Avbryt
              </Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? "Sender inn..." : "Send inn besvarelse"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
