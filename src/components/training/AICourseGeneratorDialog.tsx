import { useState, useEffect, useCallback, useRef } from "react";
import { getCurrentLanguage } from "@/lib/i18nHelpers";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Sparkles, Upload, FileText, Loader2, CheckCircle2, AlertCircle, BookOpen, Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { chunkManualText } from "@/lib/manualChunker";
import { TopicSuggestionsStep, SuggestedTopic } from "./TopicSuggestionsStep";

interface Folder {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: Folder[];
  initialFolderId?: string | null;
  onCourseCreated: (courseId: string) => void;
}

type Step = "select" | "upload" | "topics" | "config" | "generate" | "done";

interface ExistingManual {
  id: string;
  title: string;
  page_count: number | null;
  file_size: number | null;
  created_at: string;
  chunk_count: number;
}

export const AICourseGeneratorDialog = ({
  open,
  onOpenChange,
  folders,
  initialFolderId,
  onCourseCreated,
}: Props) => {
  const { t } = useTranslation();
  const { companyId, user } = useAuth();
  const [step, setStep] = useState<Step>("select");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState("");
  const [manualId, setManualId] = useState<string | null>(null);
  const [chunkCount, setChunkCount] = useState(0);

  // Existing manuals
  const [existingManuals, setExistingManuals] = useState<ExistingManual[]>([]);
  const [loadingManuals, setLoadingManuals] = useState(false);

  // Topics
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [topics, setTopics] = useState<SuggestedTopic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<SuggestedTopic | null>(null);
  const [topicsError, setTopicsError] = useState<string | null>(null);

  // Config
  const [length, setLength] = useState<5 | 10 | 15>(10);
  const [includeNarration, setIncludeNarration] = useState(true);
  const [includeVisuals, setIncludeVisuals] = useState(true);
  const [voice, setVoice] = useState<string>("coral");
  const [folderId, setFolderId] = useState<string | null>(initialFolderId || null);

  const [generating, setGenerating] = useState(false);
  const [generationStage, setGenerationStage] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setStep("select");
      setFile(null);
      setTitle("");
      setManualId(null);
      setChunkCount(0);
      setUploadProgress(0);
      setUploadStage("");
      setErrorMsg(null);
      setTopics([]);
      setSelectedTopic(null);
      setTopicsError(null);
      setFolderId(initialFolderId || null);
      loadExistingManuals();
    }
  }, [open, initialFolderId, companyId]);

  const loadExistingManuals = async () => {
    if (!companyId) return;
    setLoadingManuals(true);
    try {
      const { data: manuals, error } = await supabase
        .from("manuals")
        .select("id, title, page_count, file_size, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = (manuals || []).map((m) => m.id);
      let counts: Record<string, number> = {};
      if (ids.length > 0) {
        const { data: chunks } = await supabase
          .from("manual_chunks")
          .select("manual_id")
          .in("manual_id", ids);
        for (const c of chunks || []) {
          counts[c.manual_id] = (counts[c.manual_id] || 0) + 1;
        }
      }
      setExistingManuals(
        (manuals || []).map((m) => ({ ...m, chunk_count: counts[m.id] || 0 }))
      );
    } catch (e) {
      console.error("loadExistingManuals", e);
    } finally {
      setLoadingManuals(false);
    }
  };

  const useExistingManual = (m: ExistingManual) => {
    if (m.chunk_count === 0) {
      toast.error(t("training.aiGenerator.errorNoManualIndex"));
      return;
    }
    setManualId(m.id);
    setTitle(m.title);
    setChunkCount(m.chunk_count);
    setStep("topics");
    fetchTopics(m.id);
  };

  const isPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
  const isDocx = (f: File) =>
    f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    /\.docx$/i.test(f.name);

  const handleFileSelect = (selected: File | undefined) => {
    if (!selected) return;
    if (!isPdf(selected) && !isDocx(selected)) {
      toast.error(t("training.aiGenerator.errorFileType"));
      return;
    }
    if (/\.doc$/i.test(selected.name) && !isDocx(selected)) {
      toast.error(t("training.aiGenerator.errorOldDoc"));
      return;
    }
    if (selected.size > 50 * 1024 * 1024) {
      toast.error(t("training.aiGenerator.errorFileSize"));
      return;
    }
    setFile(selected);
    if (!title) setTitle(selected.name.replace(/\.(pdf|docx)$/i, ""));
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFileSelect(e.dataTransfer.files?.[0]);
  }, []);

  const fetchTopics = async (mid: string) => {
    setTopicsLoading(true);
    setTopicsError(null);
    setTopics([]);
    try {
      const { data, error } = await supabase.functions.invoke("suggest-course-topics", {
        body: { manual_id: mid, language: getCurrentLanguage() },
      });
      if (error) {
        const ctx: any = (error as any).context;
        if (ctx?.status === 429) throw new Error(t("training.aiGenerator.aiOverloaded"));
        if (ctx?.status === 402) throw new Error(t("training.aiGenerator.aiCreditsUsedUp"));
        throw error;
      }
      setTopics(data?.topics || []);
      if (!data?.topics?.length) {
        setTopicsError(t("training.aiGenerator.aiNoTopics"));
      }
    } catch (e: any) {
      console.error(e);
      setTopicsError(e?.message || t("training.aiGenerator.fetchTopicsFailed"));
    } finally {
      setTopicsLoading(false);
    }
  };

  const extractAndUpload = async () => {
    if (!file || !companyId || !user) return;
    setErrorMsg(null);
    setUploadProgress(5);
    setUploadStage(isDocx(file) ? t("training.aiGenerator.readingWord") : t("training.aiGenerator.readingPdf"));

    try {
      let fullText = "";
      let pageCount = 0;
      const arrayBuf = await file.arrayBuffer();

      if (isDocx(file)) {
        const mammoth: any = await import("mammoth");
        const result = await mammoth.extractRawText({ arrayBuffer: arrayBuf });
        fullText = result.value || "";
        pageCount = Math.max(1, Math.ceil(fullText.length / 3000));
        setUploadProgress(40);
      } else {
        const pdfjs: any = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
        const pdf = await pdfjs.getDocument({ data: arrayBuf }).promise;
        pageCount = pdf.numPages;
        for (let p = 1; p <= pageCount; p++) {
          const page = await pdf.getPage(p);
          const content = await page.getTextContent();
          const pageText = content.items.map((it: any) => it.str).join(" ");
          fullText += "\n\n" + pageText;
          setUploadProgress(5 + Math.floor((p / pageCount) * 35));
        }
      }

      setUploadStage(t("training.aiGenerator.splittingSections"));
      const chunks = chunkManualText(fullText);
      if (chunks.length === 0) {
        throw new Error(
          isDocx(file)
            ? t("training.aiGenerator.errorNoTextWord")
            : t("training.aiGenerator.errorNoTextPdf")
        );
      }
      setUploadProgress(45);

      setUploadStage(t("training.aiGenerator.savingManual"));
      const manualUuid = crypto.randomUUID();
      const ext = isDocx(file) ? "docx" : "pdf";
      const path = `${companyId}/${manualUuid}.${ext}`;
      const contentType = isDocx(file)
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/pdf";

      const { error: uploadErr } = await supabase.storage
        .from("manuals")
        .upload(path, file, { contentType, upsert: false });
      if (uploadErr) throw uploadErr;
      setUploadProgress(60);

      const { error: insertErr } = await supabase.from("manuals").insert({
        id: manualUuid,
        company_id: companyId,
        title: title.trim() || file.name,
        file_url: path,
        file_size: file.size,
        page_count: pageCount,
        uploaded_by: user.id,
      } as any);
      if (insertErr) throw insertErr;

      setManualId(manualUuid);
      setUploadStage(t("training.aiGenerator.generatingIndex"));
      setUploadProgress(70);

      const { data: procData, error: procErr } = await supabase.functions.invoke("process-manual", {
        body: {
          manual_id: manualUuid,
          chunks: chunks.map((c) => ({ index: c.index, text: c.text, heading: c.heading || null })),
        },
      });
      if (procErr) throw procErr;
      setChunkCount(procData?.chunk_count || chunks.length);
      setUploadProgress(100);
      setUploadStage(t("training.aiGenerator.done"));
      setStep("topics");
      fetchTopics(manualUuid);
    } catch (e: any) {
      console.error(e);
      const msg = e?.message || t("training.aiGenerator.uploadFailed");
      setErrorMsg(msg);
      toast.error(msg);
      setUploadProgress(0);
      setUploadStage("");
    }
  };

  const handleGenerate = async () => {
    if (!manualId || !selectedTopic) return;
    setGenerating(true);
    setErrorMsg(null);
    setStep("generate");
    setGenerationStage(t("training.aiGenerator.analyzingManual"));

    try {
      // Progressive UI hints (since we can't get real progress from the function)
      setTimeout(() => {
        if (includeVisuals) setGenerationStage(t("training.aiGenerator.generatingImages"));
      }, 6000);
      setTimeout(() => {
        if (includeNarration) setGenerationStage(t("training.aiGenerator.generatingNarration"));
      }, 14000);
      setTimeout(() => setGenerationStage(t("training.aiGenerator.generatingQuestions")), 22000);

      const { data, error } = await supabase.functions.invoke("generate-course", {
        body: {
          manual_id: manualId,
          length,
          folder_id: folderId,
          topic_title: selectedTopic.title,
          topic_description: selectedTopic.description,
          chapter_reference: selectedTopic.chapter_reference,
          focus_query: selectedTopic.focus_query,
          include_narration: includeNarration,
          include_visuals: includeVisuals,
          voice: includeNarration ? voice : undefined,
          language: getCurrentLanguage(),
        },
      });

      if (error) {
        const ctx: any = (error as any).context;
        if (ctx?.status === 429) throw new Error(t("training.aiGenerator.aiOverloaded"));
        if (ctx?.status === 402) throw new Error(t("training.aiGenerator.aiCreditsUsedUpWorkspace"));
        throw error;
      }

      if (!data?.course_id) throw new Error(t("training.aiGenerator.aiNoCourse"));

      setGenerationStage(t("training.aiGenerator.savingCourse"));
      const generated = data.questions_generated ?? 0;
      const requested = data.questions_requested ?? length;
      const intros = data.intro_slides_generated ?? 0;
      toast.success(
        t("training.aiGenerator.courseCreatedToast", { intros, generated, requested })
      );
      const warnings: string[] = Array.isArray(data.warnings) ? data.warnings : [];
      if (warnings.length > 0) {
        toast.warning(warnings.slice(0, 3).join(" • "), { duration: 8000 });
      }
      setStep("done");
      onCourseCreated(data.course_id);
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      const msg = e?.message || t("training.aiGenerator.generateFailed");
      setErrorMsg(msg);
      toast.error(msg);
      setStep("config");
    } finally {
      setGenerating(false);
    }
  };

  const renderSelect = () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t("training.aiGenerator.selectIntro")}
      </p>

      {loadingManuals ? (
        <div className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : existingManuals.length > 0 ? (
        <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
          {existingManuals.map((m) => {
            const indexed = m.chunk_count > 0;
            return (
              <Card
                key={m.id}
                onClick={() => indexed && useExistingManual(m)}
                className={`p-3 transition border-2 ${
                  indexed
                    ? "cursor-pointer border-border hover:border-primary hover:bg-muted/30"
                    : "border-border opacity-60 cursor-not-allowed"
                }`}
              >
                <div className="flex items-start gap-3">
                  <BookOpen className="h-5 w-5 mt-0.5 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{m.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {indexed ? t("training.aiGenerator.indexedSections", { count: m.chunk_count }) : t("training.aiGenerator.notIndexed")}
                      {m.page_count ? t("training.aiGenerator.pages", { count: m.page_count }) : ""}
                      {t("training.aiGenerator.uploadedAt")}
                      {formatDistanceToNow(new Date(m.created_at), { addSuffix: true, locale: nb })}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="py-6 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
          {t("training.aiGenerator.noManuals")}
        </div>
      )}

      <div className="flex justify-between gap-2 pt-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>{t("training.common.cancel")}</Button>
        <Button onClick={() => setStep("upload")}>
          <Plus className="h-4 w-4 mr-2" /> {t("training.aiGenerator.uploadNew")}
        </Button>
      </div>
    </div>
  );

  const renderUpload = () => (
    <div className="space-y-4">
      <div>
        <Label htmlFor="manual-title">{t("training.aiGenerator.titleLabel")}</Label>
        <Input
          id="manual-title"
          placeholder={t("training.aiGenerator.titlePlaceholder")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1"
        />
      </div>

      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:bg-muted/30 transition"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files?.[0])}
        />
        {file ? (
          <div className="flex flex-col items-center gap-2">
            <FileText className="h-10 w-10 text-primary" />
            <p className="font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Upload className="h-10 w-10" />
            <p className="font-medium">{t("training.aiGenerator.dropHint")}</p>
            <p className="text-xs">{t("training.aiGenerator.dropSubHint")}</p>
          </div>
        )}
      </div>

      {uploadStage && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{uploadStage}</span>
            <span className="text-muted-foreground">{uploadProgress}%</span>
          </div>
          <Progress value={uploadProgress} />
        </div>
      )}

      {errorMsg && (
        <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="flex justify-between gap-2">
        <Button variant="outline" onClick={() => setStep("select")} disabled={uploadProgress > 0 && uploadProgress < 100}>
          {t("training.common.back")}
        </Button>
        <Button onClick={extractAndUpload} disabled={!file || !title.trim() || (uploadProgress > 0 && uploadProgress < 100)}>
          {uploadProgress > 0 && uploadProgress < 100 ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t("training.aiGenerator.processing")}</>
          ) : (
            <>{t("training.aiGenerator.uploadContinue")}</>
          )}
        </Button>
      </div>
    </div>
  );

  const renderTopics = () => (
    <div className="space-y-4">
      <Card className="p-3 bg-muted/30 flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-primary" />
        <span className="text-sm">
          {t("training.aiGenerator.indexedCount", { title, count: chunkCount })}
        </span>
      </Card>

      <TopicSuggestionsStep
        loading={topicsLoading}
        topics={topics}
        selected={selectedTopic}
        onSelect={setSelectedTopic}
        errorMsg={topicsError}
        onRetry={manualId ? () => fetchTopics(manualId) : undefined}
      />

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>{t("training.common.cancel")}</Button>
        <Button onClick={() => setStep("config")} disabled={!selectedTopic}>
          {t("training.common.continue")}
        </Button>
      </div>
    </div>
  );

  const renderConfig = () => (
    <div className="space-y-5">
      {selectedTopic && (
        <Card className="p-3 bg-primary/5 border-primary/30">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{t("training.aiGenerator.chosenTopic")}</p>
          <p className="font-semibold text-sm">{selectedTopic.title}</p>
          <p className="text-xs text-muted-foreground mt-1">{selectedTopic.chapter_reference} · {selectedTopic.description}</p>
        </Card>
      )}

      <div>
        <Label>{t("training.aiGenerator.questionCount")}</Label>
        <RadioGroup
          value={String(length)}
          onValueChange={(v) => setLength(Number(v) as 5 | 10 | 15)}
          className="flex gap-4 mt-2"
        >
          {[5, 10, 15].map((n) => (
            <label key={n} className="flex items-center gap-2 cursor-pointer">
              <RadioGroupItem value={String(n)} id={`len-${n}`} />
              <span>{n}</span>
            </label>
          ))}
        </RadioGroup>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <Label htmlFor="narration-toggle" className="font-medium">{t("training.aiGenerator.includeNarration")}</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("training.aiGenerator.includeNarrationDesc")}
            </p>
          </div>
          <Switch id="narration-toggle" checked={includeNarration} onCheckedChange={setIncludeNarration} />
        </div>
        {includeNarration && (
          <div className="pt-2 border-t">
            <Label htmlFor="voice-select" className="text-sm">{t("training.aiGenerator.voice")}</Label>
            <Select value={voice} onValueChange={setVoice}>
              <SelectTrigger id="voice-select" className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="coral">{t("training.aiGenerator.voiceCoral")}</SelectItem>
                <SelectItem value="sage">{t("training.aiGenerator.voiceSage")}</SelectItem>
                <SelectItem value="nova">{t("training.aiGenerator.voiceNova")}</SelectItem>
                <SelectItem value="onyx">{t("training.aiGenerator.voiceOnyx")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              {t("training.aiGenerator.voiceHint")}
            </p>
          </div>
        )}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <Label htmlFor="visuals-toggle" className="font-medium">{t("training.aiGenerator.includeVisuals")}</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("training.aiGenerator.includeVisualsDesc")}
            </p>
          </div>
          <Switch id="visuals-toggle" checked={includeVisuals} onCheckedChange={setIncludeVisuals} />
        </div>
      </div>

      {folders.length > 0 && (
        <div>
          <Label>{t("training.aiGenerator.folderOptional")}</Label>
          <Select value={folderId || "_none"} onValueChange={(v) => setFolderId(v === "_none" ? null : v)}>
            <SelectTrigger className="mt-1"><SelectValue placeholder={t("training.aiGenerator.noFolder")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">{t("training.aiGenerator.noFolder")}</SelectItem>
              {folders.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setStep("topics")}>{t("training.common.back")}</Button>
        <Button onClick={handleGenerate} disabled={generating}>
          <Sparkles className="h-4 w-4 mr-2" />
          {t("training.aiGenerator.generateCourse")}
        </Button>
      </div>
    </div>
  );

  const renderGenerate = () => (
    <div className="py-8 flex flex-col items-center gap-4 text-center">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <p className="font-medium">{generationStage}</p>
      <p className="text-sm text-muted-foreground">
        {t("training.aiGenerator.generateTime", { extra: includeVisuals || includeNarration ? t("training.aiGenerator.generateTimeExtra") : "" })}
      </p>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {t("training.aiGenerator.title")}
          </DialogTitle>
          <DialogDescription>
            {step === "select" && t("training.aiGenerator.descSelect")}
            {step === "upload" && t("training.aiGenerator.descUpload")}
            {step === "topics" && t("training.aiGenerator.descTopics")}
            {step === "config" && t("training.aiGenerator.descConfig")}
            {step === "generate" && t("training.aiGenerator.descGenerate")}
          </DialogDescription>
        </DialogHeader>
        {step === "select" && renderSelect()}
        {step === "upload" && renderUpload()}
        {step === "topics" && renderTopics()}
        {step === "config" && renderConfig()}
        {step === "generate" && renderGenerate()}
      </DialogContent>
    </Dialog>
  );
};
