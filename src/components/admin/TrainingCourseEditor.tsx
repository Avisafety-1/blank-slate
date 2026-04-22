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
import { ArrowLeft, Plus, Trash2, Upload, FileText, HelpCircle, Image as ImageIcon, Youtube } from "lucide-react";
import { toast } from "sonner";
import * as pdfjsLib from "pdfjs-dist";
import { YouTubeClipPlayer, parseYouTubeId, parseTimeInput, formatSeconds } from "@/components/training/YouTubeClipPlayer";

// Set worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

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
  content_json: any;
  image_url: string | null;
  sort_order: number;
  options: QuestionOption[];
  // local-only for preview
  _localBlobUrl?: string;
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
  const [displayMode, setDisplayMode] = useState<"list" | "paginated">("paginated");
  const [fullscreen, setFullscreen] = useState(false);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!courseId);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (courseId) loadCourse();
  }, [courseId]);

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
        setDisplayMode((course as any).display_mode === "list" ? "list" : "paginated");
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

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error("Vennligst last opp en PDF-fil");
      return;
    }

    setUploadingPdf(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const pageCount = pdf.numPages;

      const newSlides: Slide[] = [];

      for (let i = 1; i <= pageCount; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport }).promise;

        const blobUrl = canvas.toDataURL("image/jpeg", 0.85);

        newSlides.push({
          slide_type: "content",
          question_text: `Slide ${i}`,
          content_json: null,
          image_url: null,
          sort_order: i - 1,
          options: [],
          _localBlobUrl: blobUrl,
        });
      }

      setSlides(newSlides);
      toast.success(`${pageCount} sider lastet inn fra PDF`);
    } catch (err) {
      console.error("Error parsing PDF:", err);
      toast.error("Kunne ikke lese PDF-filen");
    } finally {
      setUploadingPdf(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const addQuestionAfterSlide = (afterIdx: number) => {
    const newSlide: Slide = {
      slide_type: "question",
      question_text: "",
      content_json: null,
      image_url: null,
      sort_order: afterIdx + 1,
      options: [
        { option_text: "", is_correct: true, sort_order: 0 },
        { option_text: "", is_correct: false, sort_order: 1 },
      ],
    };
    const newSlides = [...slides];
    newSlides.splice(afterIdx + 1, 0, newSlide);
    setSlides(newSlides);
  };

  const removeSlide = (idx: number) => {
    setSlides(slides.filter((_, i) => i !== idx));
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
  };

  const uploadSlideImage = async (dataUrl: string, courseId: string, slideIndex: number): Promise<string> => {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const path = `${companyId}/${courseId}/slide-${slideIndex}.jpg`;

    const { error } = await supabase.storage
      .from("training-slides")
      .upload(path, blob, { contentType: "image/jpeg", upsert: true });

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from("training-slides")
      .getPublicUrl(path);

    // Since the bucket is private, we need signed URLs
    const { data: signedData } = await supabase.storage
      .from("training-slides")
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 10); // 10 year signed URL

    return signedData?.signedUrl || urlData.publicUrl;
  };

  const handleSave = async () => {
    if (!companyId || !title.trim()) {
      toast.error("Tittel er påkrevd");
      return;
    }

    const questionSlides = slides.filter(s => s.slide_type === "question");
    for (const q of questionSlides) {
      if (!q.question_text.trim()) {
        toast.error("Spørsmålsside mangler tekst");
        return;
      }
      if (q.options.length < 2) {
        toast.error("Spørsmålet må ha minst 2 alternativer");
        return;
      }
      if (!q.options.some(o => o.is_correct)) {
        toast.error("Spørsmålet må ha ett riktig svar");
        return;
      }
      for (const o of q.options) {
        if (!o.option_text.trim()) {
          toast.error("Alle alternativer må ha tekst");
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

      // Upload slide images that have local blob URLs
      const updatedSlides = [...slides];
      for (let i = 0; i < updatedSlides.length; i++) {
        const s = updatedSlides[i];
        if (s._localBlobUrl && s.slide_type === "content") {
          const imageUrl = await uploadSlideImage(s._localBlobUrl, cId!, i);
          updatedSlides[i] = { ...s, image_url: imageUrl, _localBlobUrl: undefined };
        }
      }

      // Delete existing questions (cascade deletes options)
      if (courseId) {
        await supabase.from("training_questions").delete().eq("course_id", courseId);
      }

      // Insert slides
      for (let i = 0; i < updatedSlides.length; i++) {
        const s = updatedSlides[i];
        const { data: qData, error: qErr } = await supabase
          .from("training_questions")
          .insert({
            course_id: cId!,
            question_text: s.question_text.trim() || (s.slide_type === "content" ? `Slide ${i + 1}` : ""),
            image_url: s.image_url,
            sort_order: i,
            slide_type: s.slide_type,
            content_json: null,
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

  const contentSlideCount = slides.filter(s => s.slide_type === "content").length;
  const questionSlideCount = slides.filter(s => s.slide_type === "question").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-xl font-bold flex-1">{courseId ? "Rediger kurs" : "Nytt kurs"}</h2>
      </div>

      {/* Course details */}
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
          <div className="flex items-center gap-3 mt-3">
            <Switch checked={fullscreen} onCheckedChange={setFullscreen} id="fullscreen-toggle" />
            <Label htmlFor="fullscreen-toggle">Fullskjerm-modus ved gjennomføring</Label>
          </div>
        </CardContent>
      </Card>

      {/* PDF Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Last opp presentasjon</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Last opp en PDF-fil (eksporter fra PowerPoint/Keynote). Hver side blir en slide i kurset.
          </p>
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handlePdfUpload}
              className="hidden"
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPdf}
            >
              <Upload className="h-4 w-4 mr-2" />
              {uploadingPdf ? "Leser PDF..." : "Velg PDF-fil"}
            </Button>
            {contentSlideCount > 0 && (
              <Badge variant="secondary">
                <ImageIcon className="h-3 w-3 mr-1" />
                {contentSlideCount} slides
              </Badge>
            )}
          </div>
          {uploadingPdf && (
            <p className="text-xs text-muted-foreground">Konverterer sider til bilder...</p>
          )}
        </CardContent>
      </Card>

      {/* Slides preview + question management */}
      {slides.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              Sider ({slides.length}) · {questionSlideCount} spørsmål
            </h3>
          </div>

          {slides.map((s, sIdx) => (
            <Card key={sIdx}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-muted-foreground w-6">{sIdx + 1}.</span>
                  <Badge variant={s.slide_type === "content" ? "secondary" : "outline"} className="text-xs">
                    {s.slide_type === "content" ? "Slide" : "Spørsmål"}
                  </Badge>
                  <div className="flex-1" />
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" disabled={sIdx === 0} onClick={() => moveSlide(sIdx, sIdx - 1)} className="h-7 w-7 p-0">↑</Button>
                    <Button size="sm" variant="ghost" disabled={sIdx === slides.length - 1} onClick={() => moveSlide(sIdx, sIdx + 1)} className="h-7 w-7 p-0">↓</Button>
                  </div>
                  {s.slide_type === "question" && (
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeSlide(sIdx)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {/* Content slide: show image preview */}
                {s.slide_type === "content" && (
                  <div className="space-y-2">
                    {(s._localBlobUrl || s.image_url) && (
                      <img
                        src={s._localBlobUrl || s.image_url!}
                        alt={`Slide ${sIdx + 1}`}
                        className="w-full max-h-64 object-contain rounded border bg-muted/20"
                      />
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => addQuestionAfterSlide(sIdx)}
                      className="text-xs"
                    >
                      <HelpCircle className="h-3.5 w-3.5 mr-1" />
                      Legg til spørsmål etter denne sliden
                    </Button>
                  </div>
                )}

                {/* Question slide */}
                {s.slide_type === "question" && (
                  <div className="space-y-3">
                    <div>
                      <Label className="text-sm">Spørsmål</Label>
                      <Input
                        value={s.question_text}
                        onChange={(e) => updateSlide(sIdx, "question_text", e.target.value)}
                        placeholder="Skriv spørsmålet her..."
                      />
                    </div>
                    <div className="space-y-2">
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
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Save bar */}
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
