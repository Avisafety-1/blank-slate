import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Trash2, GripVertical, Maximize, Minimize, FileText, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { SlideEditor } from "@/components/training/SlideEditor";
import { SlideCanvasEditor, type CanvasData } from "@/components/training/SlideCanvasEditor";
import type { JSONContent } from "@tiptap/react";

interface QuestionOption {
  id?: string;
  option_text: string;
  is_correct: boolean;
  sort_order: number;
}

interface Slide {
  id?: string;
  slide_type: "content" | "question";
  question_text: string;
  content_json: JSONContent | null;
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
  const [slides, setSlides] = useState<Slide[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!courseId);
  const [isEditorFullscreen, setIsEditorFullscreen] = useState(false);
  const [activeSlideIdx, setActiveSlideIdx] = useState(0);
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

        const loadedSlides: Slide[] = questionsData.map((q: any) => ({
          id: q.id,
          slide_type: q.slide_type || "question",
          question_text: q.question_text,
          content_json: q.content_json || null,
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
        setSlides(loadedSlides);
      }
    } catch (err) {
      console.error("Error loading course:", err);
      toast.error("Kunne ikke laste kurs");
    } finally {
      setLoading(false);
    }
  };

  const addSlide = (type: "content" | "question") => {
    const newSlide: Slide = {
      slide_type: type,
      question_text: "",
      content_json: null,
      image_url: null,
      sort_order: slides.length,
      options: type === "question" ? [
        { option_text: "", is_correct: true, sort_order: 0 },
        { option_text: "", is_correct: false, sort_order: 1 },
      ] : [],
    };
    setSlides([...slides, newSlide]);
    setActiveSlideIdx(slides.length);
  };

  const removeSlide = (idx: number) => {
    const newSlides = slides.filter((_, i) => i !== idx);
    setSlides(newSlides);
    if (activeSlideIdx >= newSlides.length) setActiveSlideIdx(Math.max(0, newSlides.length - 1));
  };

  const updateSlide = (idx: number, field: keyof Slide, value: any) => {
    setSlides(slides.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  };

  const addOption = (sIdx: number) => {
    const s = slides[sIdx];
    updateSlide(sIdx, "options", [
      ...s.options,
      { option_text: "", is_correct: false, sort_order: s.options.length },
    ]);
  };

  const removeOption = (sIdx: number, oIdx: number) => {
    const s = slides[sIdx];
    updateSlide(sIdx, "options", s.options.filter((_, i) => i !== oIdx));
  };

  const updateOption = (sIdx: number, oIdx: number, field: keyof QuestionOption, value: any) => {
    const s = slides[sIdx];
    const newOpts = s.options.map((o, i) => {
      if (i === oIdx) return { ...o, [field]: value };
      if (field === "is_correct" && value === true) return { ...o, is_correct: false };
      return o;
    });
    updateSlide(sIdx, "options", newOpts);
  };

  const moveSlide = (from: number, to: number) => {
    if (to < 0 || to >= slides.length) return;
    const newSlides = [...slides];
    const [moved] = newSlides.splice(from, 1);
    newSlides.splice(to, 0, moved);
    setSlides(newSlides);
    setActiveSlideIdx(to);
  };

  const handleSave = async () => {
    if (!companyId || !title.trim()) {
      toast.error("Tittel er påkrevd");
      return;
    }

    // Validate question slides
    const questionSlides = slides.filter(s => s.slide_type === "question");
    for (let i = 0; i < questionSlides.length; i++) {
      const q = questionSlides[i];
      if (!q.question_text.trim() && !q.content_json) {
        toast.error(`Spørsmålsside mangler tekst`);
        return;
      }
      if (q.options.length < 2) {
        toast.error(`Spørsmålet må ha minst 2 alternativer`);
        return;
      }
      if (!q.options.some(o => o.is_correct)) {
        toast.error(`Spørsmålet må ha ett riktig svar`);
        return;
      }
      for (const o of q.options) {
        if (!o.option_text.trim()) {
          toast.error(`Alle alternativer må ha tekst`);
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

      // Delete existing questions (cascade deletes options)
      if (courseId) {
        await supabase.from("training_questions").delete().eq("course_id", courseId);
      }

      // Insert slides
      for (let i = 0; i < slides.length; i++) {
        const s = slides[i];
        const { data: qData, error: qErr } = await supabase
          .from("training_questions")
          .insert({
            course_id: cId!,
            question_text: s.question_text.trim() || (s.slide_type === "content" ? "Innholdsside" : ""),
            image_url: s.image_url,
            sort_order: i,
            slide_type: s.slide_type,
            content_json: s.content_json,
          } as any)
          .select("id")
          .single();
        if (qErr) throw qErr;

        if (s.slide_type === "question" && s.options.length > 0) {
          const optionsToInsert = s.options.map((o, j) => ({
            question_id: qData.id,
            option_text: o.option_text.trim(),
            is_correct: o.is_correct,
            sort_order: j,
          }));
          const { error: oErr } = await supabase.from("training_question_options").insert(optionsToInsert);
          if (oErr) throw oErr;
        }
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

  const activeSlide = slides[activeSlideIdx];

  // Fullscreen editor layout
  if (isEditorFullscreen) {
    return (
      <div ref={editorRef} className="bg-background h-screen flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center gap-3 p-3 border-b bg-muted/30 shrink-0">
          <Button variant="ghost" size="sm" onClick={toggleEditorFullscreen}>
            <Minimize className="h-4 w-4 mr-1" />
            Avslutt fullskjerm
          </Button>
          <h2 className="text-sm font-semibold flex-1 truncate">{title || "Nytt kurs"}</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => addSlide("content")}>
              <FileText className="h-3.5 w-3.5 mr-1" />
              Innholdsside
            </Button>
            <Button size="sm" variant="outline" onClick={() => addSlide("question")}>
              <HelpCircle className="h-3.5 w-3.5 mr-1" />
              Spørsmålsside
            </Button>
          </div>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Lagrer..." : "Lagre"}
          </Button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar thumbnails */}
          <div className="w-48 border-r bg-muted/20 overflow-y-auto p-2 space-y-2 shrink-0">
            {slides.map((s, idx) => (
              <button
                key={idx}
                onClick={() => setActiveSlideIdx(idx)}
                className={`w-full text-left p-2 rounded-lg border text-xs transition-all hover:scale-[1.02] ${
                  idx === activeSlideIdx ? "border-primary bg-primary/10" : "border-border bg-card"
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-muted-foreground">{idx + 1}.</span>
                  {s.slide_type === "content" ? (
                    <Badge variant="secondary" className="text-[10px] px-1 py-0">Innhold</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] px-1 py-0">Spørsmål</Badge>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-4 w-4 p-0 ml-auto text-destructive opacity-0 group-hover:opacity-100"
                    onClick={(e) => { e.stopPropagation(); removeSlide(idx); }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <p className="text-muted-foreground truncate text-[11px]">
                  {s.slide_type === "question" ? (s.question_text || "Tom spørsmålsside") : "Innholdsside"}
                </p>
              </button>
            ))}
            {slides.length === 0 && (
              <p className="text-[11px] text-muted-foreground text-center py-4">Ingen sider ennå</p>
            )}
          </div>

          {/* Main editor area */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeSlide ? (
              <div className="max-w-3xl mx-auto space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant={activeSlide.slide_type === "content" ? "secondary" : "outline"}>
                      {activeSlide.slide_type === "content" ? "Innholdsside" : "Spørsmålsside"}
                    </Badge>
                    <span className="text-sm text-muted-foreground">Side {activeSlideIdx + 1} av {slides.length}</span>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" disabled={activeSlideIdx === 0} onClick={() => moveSlide(activeSlideIdx, activeSlideIdx - 1)}>↑</Button>
                    <Button size="sm" variant="ghost" disabled={activeSlideIdx === slides.length - 1} onClick={() => moveSlide(activeSlideIdx, activeSlideIdx + 1)}>↓</Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeSlide(activeSlideIdx)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Canvas editor for content */}
                <SlideCanvasEditor
                  data={isCanvasFormat(activeSlide.content_json) ? activeSlide.content_json as CanvasData : migrateToCanvas(activeSlide.content_json)}
                  onChange={(canvasData) => updateSlide(activeSlideIdx, "content_json", canvasData)}
                />

                {/* Question options (only for question slides) */}
                {activeSlide.slide_type === "question" && (
                  <Card>
                    <CardContent className="pt-4 space-y-3">
                      <Label className="text-sm font-medium">Svaralternativer</Label>
                      {activeSlide.options.map((o, oIdx) => (
                        <div key={oIdx} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`correct-fs-${activeSlideIdx}`}
                            checked={o.is_correct}
                            onChange={() => updateOption(activeSlideIdx, oIdx, "is_correct", true)}
                            className="accent-primary"
                            title="Marker som riktig svar"
                          />
                          <Input
                            value={o.option_text}
                            onChange={(e) => updateOption(activeSlideIdx, oIdx, "option_text", e.target.value)}
                            placeholder={`Alternativ ${oIdx + 1}`}
                            className="flex-1"
                          />
                          {activeSlide.options.length > 2 && (
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" onClick={() => removeOption(activeSlideIdx, oIdx)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      ))}
                      <Button size="sm" variant="ghost" onClick={() => addOption(activeSlideIdx)} className="text-xs">
                        <Plus className="h-3 w-3 mr-1" />
                        Legg til alternativ
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center space-y-3">
                  <p>Legg til en side for å begynne</p>
                  <div className="flex gap-2 justify-center">
                    <Button variant="outline" onClick={() => addSlide("content")}>
                      <FileText className="h-4 w-4 mr-1" />
                      Innholdsside
                    </Button>
                    <Button variant="outline" onClick={() => addSlide("question")}>
                      <HelpCircle className="h-4 w-4 mr-1" />
                      Spørsmålsside
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Normal (non-fullscreen) editor layout
  return (
    <div ref={editorRef} className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-xl font-bold flex-1">{courseId ? "Rediger kurs" : "Nytt kurs"}</h2>
        <Button variant="ghost" size="sm" onClick={toggleEditorFullscreen}>
          <Maximize className="h-4 w-4 mr-1" />
          Fullskjerm-redigering
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
                <span className="text-sm">Alle sider på én side</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="displayMode" checked={displayMode === "paginated"} onChange={() => setDisplayMode("paginated")} className="accent-primary" />
                <span className="text-sm">Én side om gangen</span>
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
          <h3 className="text-lg font-semibold">Sider ({slides.length})</h3>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => addSlide("content")}>
              <FileText className="h-4 w-4 mr-1" />
              Innholdsside
            </Button>
            <Button size="sm" variant="outline" onClick={() => addSlide("question")}>
              <HelpCircle className="h-4 w-4 mr-1" />
              Spørsmålsside
            </Button>
          </div>
        </div>

        {slides.map((s, sIdx) => (
          <Card key={sIdx} className={activeSlideIdx === sIdx ? "ring-2 ring-primary/30" : ""}>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-start gap-2">
                <GripVertical className="h-5 w-5 text-muted-foreground mt-2 flex-shrink-0 cursor-grab" />
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground w-6">{sIdx + 1}.</span>
                    <Badge variant={s.slide_type === "content" ? "secondary" : "outline"} className="text-xs">
                      {s.slide_type === "content" ? "Innhold" : "Spørsmål"}
                    </Badge>
                    <div className="flex-1" />
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" disabled={sIdx === 0} onClick={() => moveSlide(sIdx, sIdx - 1)} className="h-7 w-7 p-0">↑</Button>
                      <Button size="sm" variant="ghost" disabled={sIdx === slides.length - 1} onClick={() => moveSlide(sIdx, sIdx + 1)} className="h-7 w-7 p-0">↓</Button>
                    </div>
                    <Button size="sm" variant="ghost" className="text-destructive flex-shrink-0" onClick={() => removeSlide(sIdx)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Canvas editor for content */}
                  <SlideCanvasEditor
                    data={isCanvasFormat(s.content_json) ? s.content_json as CanvasData : migrateToCanvas(s.content_json)}
                    onChange={(canvasData) => updateSlide(sIdx, "content_json", canvasData)}
                  />

                  {/* Question options */}
                  {s.slide_type === "question" && (
                    <div className="space-y-2 pl-2">
                      <Label className="text-xs text-muted-foreground">Svaralternativer</Label>
                      {s.options.map((o, oIdx) => (
                        <div key={oIdx} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`correct-${sIdx}`}
                            checked={o.is_correct}
                            onChange={() => updateOption(sIdx, oIdx, "is_correct", true)}
                            className="accent-primary"
                            title="Marker som riktig svar"
                          />
                          <Input
                            value={o.option_text}
                            onChange={(e) => updateOption(sIdx, oIdx, "option_text", e.target.value)}
                            placeholder={`Alternativ ${oIdx + 1}`}
                            className="flex-1"
                          />
                          {s.options.length > 2 && (
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" onClick={() => removeOption(sIdx, oIdx)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      ))}
                      <Button size="sm" variant="ghost" onClick={() => addOption(sIdx)} className="text-xs">
                        <Plus className="h-3 w-3 mr-1" />
                        Legg til alternativ
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {slides.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground text-sm space-y-3">
              <p>Ingen sider ennå. Legg til en innholdsside eller spørsmålsside.</p>
              <div className="flex gap-2 justify-center">
                <Button variant="outline" onClick={() => addSlide("content")}>
                  <FileText className="h-4 w-4 mr-1" />
                  Innholdsside
                </Button>
                <Button variant="outline" onClick={() => addSlide("question")}>
                  <HelpCircle className="h-4 w-4 mr-1" />
                  Spørsmålsside
                </Button>
              </div>
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
