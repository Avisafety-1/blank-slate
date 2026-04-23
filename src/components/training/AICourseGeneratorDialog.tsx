import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Sparkles, Upload, FileText, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { chunkManualText } from "@/lib/manualChunker";

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

type Step = "upload" | "config" | "generate" | "done";

export const AICourseGeneratorDialog = ({
  open,
  onOpenChange,
  folders,
  initialFolderId,
  onCourseCreated,
}: Props) => {
  const { companyId, user } = useAuth();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState("");
  const [manualId, setManualId] = useState<string | null>(null);
  const [chunkCount, setChunkCount] = useState(0);

  // Config
  const [role, setRole] = useState("Pilot");
  const [difficulty, setDifficulty] = useState("Medium");
  const [length, setLength] = useState<5 | 10 | 20>(10);
  const [focusArea, setFocusArea] = useState("");
  const [folderId, setFolderId] = useState<string | null>(initialFolderId || null);

  const [generating, setGenerating] = useState(false);
  const [generationStage, setGenerationStage] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setStep("upload");
      setFile(null);
      setTitle("");
      setManualId(null);
      setChunkCount(0);
      setUploadProgress(0);
      setUploadStage("");
      setErrorMsg(null);
      setFolderId(initialFolderId || null);
    }
  }, [open, initialFolderId]);

  const isPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
  const isDocx = (f: File) =>
    f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    /\.docx$/i.test(f.name);

  const handleFileSelect = (selected: File | undefined) => {
    if (!selected) return;
    if (!isPdf(selected) && !isDocx(selected)) {
      toast.error("Kun PDF- eller Word-filer (.docx) er støttet");
      return;
    }
    if (/\.doc$/i.test(selected.name) && !isDocx(selected)) {
      toast.error("Gamle .doc-filer støttes ikke. Lagre som .docx og prøv igjen.");
      return;
    }
    if (selected.size > 50 * 1024 * 1024) {
      toast.error("Filen er for stor (maks 50 MB)");
      return;
    }
    setFile(selected);
    if (!title) setTitle(selected.name.replace(/\.(pdf|docx)$/i, ""));
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFileSelect(e.dataTransfer.files?.[0]);
  }, []);

  const extractAndUpload = async () => {
    if (!file || !companyId || !user) return;
    setErrorMsg(null);
    setUploadProgress(5);
    setUploadStage(isDocx(file) ? "Leser Word-dokument…" : "Leser PDF…");

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

      setUploadStage("Splitter i seksjoner…");
      const chunks = chunkManualText(fullText);
      if (chunks.length === 0) {
        throw new Error(
          isDocx(file)
            ? "Fant ingen tekst i Word-dokumentet."
            : "Fant ingen tekst i PDF-en. Er den scannet?"
        );
      }
      setUploadProgress(45);

      // Create manual row first to get id
      setUploadStage("Lagrer manual…");
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
      setUploadStage("Genererer embeddings (AI-indeks)…");
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
      setUploadStage("Ferdig");
      setStep("config");
    } catch (e: any) {
      console.error(e);
      const msg = e?.message || "Opplasting feilet";
      setErrorMsg(msg);
      toast.error(msg);
      setUploadProgress(0);
      setUploadStage("");
    }
  };

  const handleGenerate = async () => {
    if (!manualId) return;
    setGenerating(true);
    setErrorMsg(null);
    setStep("generate");
    setGenerationStage("Analyserer manual…");

    try {
      // Brief progressive UI
      setTimeout(() => setGenerationStage("Genererer spørsmål med AI…"), 800);

      const { data, error } = await supabase.functions.invoke("generate-course", {
        body: {
          manual_id: manualId,
          role,
          difficulty,
          length,
          focus_area: focusArea.trim() || null,
          folder_id: folderId,
        },
      });

      if (error) {
        // Try to parse status from error context
        const ctx: any = (error as any).context;
        if (ctx?.status === 429) {
          throw new Error("AI er overbelastet. Prøv igjen om litt.");
        }
        if (ctx?.status === 402) {
          throw new Error("AI-kreditter brukt opp. Legg til kreditter i Workspace.");
        }
        throw error;
      }

      if (!data?.course_id) throw new Error("AI returnerte ikke et kurs");

      setGenerationStage("Lagrer kurs…");
      const generated = data.questions_generated ?? 0;
      const requested = data.questions_requested ?? length;
      toast.success(
        generated < requested
          ? `Kurs opprettet (${generated} av ${requested} spørsmål — noen ble hoppet over pga. utilstrekkelig innhold)`
          : `Kurs opprettet med ${generated} spørsmål`
      );
      setStep("done");
      onCourseCreated(data.course_id);
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      const msg = e?.message || "Generering feilet";
      setErrorMsg(msg);
      toast.error(msg);
      setStep("config");
    } finally {
      setGenerating(false);
    }
  };

  const renderUpload = () => (
    <div className="space-y-4">
      <div>
        <Label htmlFor="manual-title">Tittel</Label>
        <Input
          id="manual-title"
          placeholder="F.eks. Operasjonsmanual 2025"
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
            <p className="font-medium">Dra og slipp PDF her</p>
            <p className="text-xs">eller klikk for å velge (maks 50 MB)</p>
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

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Avbryt
        </Button>
        <Button onClick={extractAndUpload} disabled={!file || !title.trim() || uploadProgress > 0 && uploadProgress < 100}>
          {uploadProgress > 0 && uploadProgress < 100 ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Behandler…</>
          ) : (
            <>Last opp og fortsett</>
          )}
        </Button>
      </div>
    </div>
  );

  const renderConfig = () => (
    <div className="space-y-5">
      <Card className="p-3 bg-muted/30 flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-primary" />
        <span className="text-sm">
          <strong>{title}</strong> — {chunkCount} seksjoner indeksert
        </span>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Rolle</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Pilot">Pilot</SelectItem>
              <SelectItem value="Observatør">Observatør</SelectItem>
              <SelectItem value="Administrator">Administrator</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Vanskelighetsgrad</Label>
          <Select value={difficulty} onValueChange={setDifficulty}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Lett">Lett</SelectItem>
              <SelectItem value="Medium">Medium</SelectItem>
              <SelectItem value="Vanskelig">Vanskelig</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label>Antall spørsmål</Label>
        <RadioGroup
          value={String(length)}
          onValueChange={(v) => setLength(Number(v) as 5 | 10 | 20)}
          className="flex gap-4 mt-2"
        >
          {[5, 10, 20].map((n) => (
            <label key={n} className="flex items-center gap-2 cursor-pointer">
              <RadioGroupItem value={String(n)} id={`len-${n}`} />
              <span>{n}</span>
            </label>
          ))}
        </RadioGroup>
      </div>

      <div>
        <Label htmlFor="focus">Fokusområde (valgfritt)</Label>
        <Textarea
          id="focus"
          placeholder="F.eks. nødprosedyrer ved tap av GPS, batterihåndtering…"
          value={focusArea}
          onChange={(e) => setFocusArea(e.target.value)}
          rows={2}
          className="mt-1"
        />
      </div>

      {folders.length > 0 && (
        <div>
          <Label>Mappe (valgfritt)</Label>
          <Select value={folderId || "_none"} onValueChange={(v) => setFolderId(v === "_none" ? null : v)}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Ingen mappe" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">Ingen mappe</SelectItem>
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
        <Button variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
        <Button onClick={handleGenerate} disabled={generating}>
          <Sparkles className="h-4 w-4 mr-2" />
          Generer kurs
        </Button>
      </div>
    </div>
  );

  const renderGenerate = () => (
    <div className="py-8 flex flex-col items-center gap-4 text-center">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <p className="font-medium">{generationStage}</p>
      <p className="text-sm text-muted-foreground">
        Dette kan ta 20–60 sekunder. AI leser manualen og lager spørsmål basert på innholdet.
      </p>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Kursgenerator
          </DialogTitle>
          <DialogDescription>
            {step === "upload" && "Steg 1 av 2 — Last opp en operasjonsmanual (PDF)"}
            {step === "config" && "Steg 2 av 2 — Konfigurer kurset"}
            {step === "generate" && "Genererer…"}
          </DialogDescription>
        </DialogHeader>
        {step === "upload" && renderUpload()}
        {step === "config" && renderConfig()}
        {step === "generate" && renderGenerate()}
      </DialogContent>
    </Dialog>
  );
};
