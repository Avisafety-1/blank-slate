import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Plus, Trash2, GripVertical, ImagePlus, Maximize, Minimize } from "lucide-react";
import { toast } from "sonner";

interface QuestionOption {
  id?: string;
  option_text: string;
  is_correct: boolean;
  sort_order: number;
}

interface Question {
  id?: string;
  question_text: string;
  image_url: string | null;
  sort_order: number;
  options: QuestionOption[];
}

interface Props {
  courseId: string | null;
  onClose: () => void;
}

export const TrainingCourseEditor = ({ courseId, onClose }: Props) => {
  const { companyId, user } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [passingScore, setPassingScore] = useState(80);
  const [validityMonths, setValidityMonths] = useState<number | null>(null);
  const [hasPermanentValidity, setHasPermanentValidity] = useState(true);
  const [displayMode, setDisplayMode] = useState<"list" | "paginated">("list");
  const [fullscreen, setFullscreen] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!courseId);
  const [isEditorFullscreen, setIsEditorFullscreen] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (courseId) loadCourse();
  }, [courseId]);

  useEffect(() => {
    const handler = () => setIsEditorFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleEditorFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      editorRef.current?.requestFullscreen?.();
    }
  }, []);

  const loadCourse = async () => {
    if (!courseId) return;
    setLoading(true);
    try {
      const { data: course } = await supabase
        .from("training_courses")
        .select("*")
        .eq("id", courseId)
        .single();

      if (course) {
        setTitle(course.title);
        setDescription(course.description || "");
        setPassingScore(course.passing_score);
        setValidityMonths(course.validity_months);
        setHasPermanentValidity(!course.validity_months);
        setDisplayMode((course as any).display_mode === "paginated" ? "paginated" : "list");
        setFullscreen((course as any).fullscreen || false);
      }

      const { data: questionsData } = await supabase
        .from("training_questions")
        .select("*")
        .eq("course_id", courseId)
        .order("sort_order");

      if (questionsData && questionsData.length > 0) {
        const qIds = questionsData.map((q: any) => q.id);
        const { data: optionsData } = await supabase
          .from("training_question_options")
          .select("*")
          .in("question_id", qIds)
          .order("sort_order");

        const qs: Question[] = questionsData.map((q: any) => ({
          id: q.id,
          question_text: q.question_text,
          image_url: q.image_url,
          sort_order: q.sort_order,
          options: (optionsData || [])
            .filter((o: any) => o.question_id === q.id)
            .map((o: any) => ({
              id: o.id,
              option_text: o.option_text,
              is_correct: o.is_correct,
              sort_order: o.sort_order,
            })),
        }));
        setQuestions(qs);
      }
    } catch (err) {
      console.error("Error loading course:", err);
      toast.error("Kunne ikke laste kurs");
    } finally {
      setLoading(false);
    }
  };

  const addQuestion = () => {
    setQuestions([
      ...questions,
      {
        question_text: "",
        image_url: null,
        sort_order: questions.length,
        options: [
          { option_text: "", is_correct: true, sort_order: 0 },
          { option_text: "", is_correct: false, sort_order: 1 },
        ],
      },
    ]);
  };

  const removeQuestion = (idx: number) => {
    setQuestions(questions.filter((_, i) => i !== idx));
  };

  const updateQuestion = (idx: number, field: keyof Question, value: any) => {
    setQuestions(questions.map((q, i) => (i === idx ? { ...q, [field]: value } : q)));
  };

  const addOption = (qIdx: number) => {
    const q = questions[qIdx];
    updateQuestion(qIdx, "options", [
      ...q.options,
      { option_text: "", is_correct: false, sort_order: q.options.length },
    ]);
  };

  const removeOption = (qIdx: number, oIdx: number) => {
    const q = questions[qIdx];
    updateQuestion(
      qIdx,
      "options",
      q.options.filter((_, i) => i !== oIdx)
    );
  };

  const updateOption = (qIdx: number, oIdx: number, field: keyof QuestionOption, value: any) => {
    const q = questions[qIdx];
    const newOpts = q.options.map((o, i) => {
      if (i === oIdx) return { ...o, [field]: value };
      // If setting is_correct, unset others
      if (field === "is_correct" && value === true) return { ...o, is_correct: false };
      return o;
    });
    updateQuestion(qIdx, "options", newOpts);
  };

  const handleImageUpload = async (qIdx: number, file: File) => {
    if (!companyId) return;
    const ext = file.name.split(".").pop();
    const path = `${companyId}/training-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("logbook-images").upload(path, file);
    if (error) {
      toast.error("Bildeopplasting feilet");
      return;
    }
    const { data: urlData } = supabase.storage.from("logbook-images").getPublicUrl(path);
    updateQuestion(qIdx, "image_url", urlData.publicUrl);
  };

  const handleSave = async () => {
    if (!companyId || !title.trim()) {
      toast.error("Tittel er påkrevd");
      return;
    }

    // Validate questions
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question_text.trim()) {
        toast.error(`Spørsmål ${i + 1} mangler tekst`);
        return;
      }
      if (q.options.length < 2) {
        toast.error(`Spørsmål ${i + 1} må ha minst 2 alternativer`);
        return;
      }
      const hasCorrect = q.options.some((o) => o.is_correct);
      if (!hasCorrect) {
        toast.error(`Spørsmål ${i + 1} må ha ett riktig svar`);
        return;
      }
      for (let j = 0; j < q.options.length; j++) {
        if (!q.options[j].option_text.trim()) {
          toast.error(`Spørsmål ${i + 1}, alternativ ${j + 1} mangler tekst`);
          return;
        }
      }
    }

    setSaving(true);
    try {
      let cId = courseId;

      const coursePayload = {
        title: title.trim(),
        description: description.trim() || null,
        passing_score: passingScore,
        validity_months: hasPermanentValidity ? null : validityMonths,
        display_mode: displayMode,
        fullscreen,
        updated_at: new Date().toISOString(),
      };

      if (cId) {
        const { error } = await supabase.from("training_courses").update(coursePayload).eq("id", cId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("training_courses")
          .insert({ ...coursePayload, company_id: companyId, created_by: user?.id, status: "draft" })
          .select("id")
          .single();
        if (error) throw error;
        cId = data.id;
      }

      // Delete existing questions (cascade deletes options too)
      if (courseId) {
        await supabase.from("training_questions").delete().eq("course_id", courseId);
      }

      // Insert questions and options
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const { data: qData, error: qErr } = await supabase
          .from("training_questions")
          .insert({
            course_id: cId!,
            question_text: q.question_text.trim(),
            image_url: q.image_url,
            sort_order: i,
          })
          .select("id")
          .single();
        if (qErr) throw qErr;

        const optionsToInsert = q.options.map((o, j) => ({
          question_id: qData.id,
          option_text: o.option_text.trim(),
          is_correct: o.is_correct,
          sort_order: j,
        }));

        const { error: oErr } = await supabase.from("training_question_options").insert(optionsToInsert);
        if (oErr) throw oErr;
      }

      toast.success("Kurs lagret");
      onClose();
    } catch (err) {
      console.error("Error saving course:", err);
      toast.error("Kunne ikke lagre kurs");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-muted-foreground text-sm">Laster kurs...</p>;

  return (
    <div ref={editorRef} className={`space-y-6 ${isEditorFullscreen ? "bg-background p-6 overflow-y-auto h-full" : ""}`}>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-xl font-bold flex-1">{courseId ? "Rediger kurs" : "Nytt kurs"}</h2>
        <Button variant="ghost" size="sm" onClick={toggleEditorFullscreen}>
          {isEditorFullscreen ? <Minimize className="h-4 w-4 mr-1" /> : <Maximize className="h-4 w-4 mr-1" />}
          {isEditorFullscreen ? "Avslutt fullskjerm" : "Fullskjerm-redigering"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kursdetaljer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Tittel *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Navn på kurset" />
          </div>
          <div>
            <Label>Beskrivelse</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Valgfri beskrivelse" rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Bestått-grense (%)</Label>
              <Input type="number" min={1} max={100} value={passingScore} onChange={(e) => setPassingScore(Number(e.target.value))} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Switch checked={hasPermanentValidity} onCheckedChange={(v) => { setHasPermanentValidity(v); if (v) setValidityMonths(null); else setValidityMonths(12); }} />
                <Label className="text-sm">Permanent gyldighet</Label>
              </div>
              {!hasPermanentValidity && (
                <div>
                  <Label>Gyldighet (måneder)</Label>
                  <Input type="number" min={1} value={validityMonths || ""} onChange={(e) => setValidityMonths(Number(e.target.value) || null)} />
                </div>
              )}
            </div>
          </div>
          <div>
            <Label>Visningsformat</Label>
            <div className="flex items-center gap-4 mt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="displayMode" checked={displayMode === "list"} onChange={() => setDisplayMode("list")} className="accent-primary" />
                <span className="text-sm">Alle spørsmål på én side</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="displayMode" checked={displayMode === "paginated"} onChange={() => setDisplayMode("paginated")} className="accent-primary" />
                <span className="text-sm">Ett spørsmål per side</span>
              </label>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-3">
            <Switch checked={fullscreen} onCheckedChange={setFullscreen} id="fullscreen-toggle" />
            <Label htmlFor="fullscreen-toggle">Fullskjerm-modus ved gjennomføring</Label>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Spørsmål ({questions.length})</h3>
          <Button size="sm" variant="outline" onClick={addQuestion}>
            <Plus className="h-4 w-4 mr-1" />
            Legg til spørsmål
          </Button>
        </div>

        {questions.map((q, qIdx) => (
          <Card key={qIdx}>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-start gap-2">
                <GripVertical className="h-5 w-5 text-muted-foreground mt-2 flex-shrink-0" />
                <div className="flex-1 space-y-3">
                  <div className="flex items-start gap-2">
                    <span className="text-sm font-medium text-muted-foreground mt-2 w-6">{qIdx + 1}.</span>
                    <div className="flex-1">
                      <Input
                        value={q.question_text}
                        onChange={(e) => updateQuestion(qIdx, "question_text", e.target.value)}
                        placeholder="Skriv spørsmålet her"
                      />
                    </div>
                    <Button size="sm" variant="ghost" className="text-destructive flex-shrink-0" onClick={() => removeQuestion(qIdx)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Image upload */}
                  <div className="flex items-center gap-2">
                    {q.image_url ? (
                      <div className="relative">
                        <img src={q.image_url} alt="" className={`${isEditorFullscreen ? "max-h-[50vh] w-auto" : "h-20 w-20"} object-cover rounded`} />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="absolute -top-1 -right-1 h-5 w-5 p-0 bg-destructive text-destructive-foreground rounded-full"
                          onClick={() => updateQuestion(qIdx, "image_url", null)}
                        >
                          ×
                        </Button>
                      </div>
                    ) : (
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleImageUpload(qIdx, file);
                          }}
                        />
                        <div className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                          <ImagePlus className="h-4 w-4" />
                          <span>Legg til bilde</span>
                        </div>
                      </label>
                    )}
                  </div>

                  {/* Options */}
                  <div className="space-y-2 pl-6">
                    <Label className="text-xs text-muted-foreground">Svaralternativer</Label>
                    {q.options.map((o, oIdx) => (
                      <div key={oIdx} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`correct-${qIdx}`}
                          checked={o.is_correct}
                          onChange={() => updateOption(qIdx, oIdx, "is_correct", true)}
                          className="accent-primary"
                          title="Marker som riktig svar"
                        />
                        <Input
                          value={o.option_text}
                          onChange={(e) => updateOption(qIdx, oIdx, "option_text", e.target.value)}
                          placeholder={`Alternativ ${oIdx + 1}`}
                          className="flex-1"
                        />
                        {q.options.length > 2 && (
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" onClick={() => removeOption(qIdx, oIdx)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button size="sm" variant="ghost" onClick={() => addOption(qIdx)} className="text-xs">
                      <Plus className="h-3 w-3 mr-1" />
                      Legg til alternativ
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {questions.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              Ingen spørsmål ennå. Klikk «Legg til spørsmål» for å begynne.
            </CardContent>
          </Card>
        )}
      </div>

      <div className="flex items-center gap-3 justify-end sticky bottom-4 bg-background/80 backdrop-blur-sm p-3 rounded-lg border">
        <Button variant="outline" onClick={onClose}>
          Avbryt
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Lagrer..." : "Lagre kurs"}
        </Button>
      </div>
    </div>
  );
};
