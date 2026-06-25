import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { CheckCircle2, Circle, ClipboardCheck, FileText, ExternalLink, AlertTriangle, Loader2, ZoomIn, ZoomOut, RotateCcw, Download } from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
// Use local worker bundled with react-pdf's nested pdfjs-dist to guarantee version match
import pdfWorkerUrl from "react-pdf/node_modules/pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type FileMode = "image" | "pdf" | "docx" | "document" | null;

const getFileMode = (fileName: string | null | undefined, fileUrl: string | null | undefined): FileMode => {
  const source = (fileName || fileUrl || "").toLowerCase();
  const ext = source.split('.').pop()?.split('?')[0];
  if (!ext) return null;
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return "image";
  if (ext === 'pdf') return "pdf";
  if (ext === 'docx' || ext === 'doc') return "docx";
  return "document";
};

interface ChecklistItem {
  id: string;
  text: string;
}

interface ChecklistExecutionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checklistIds?: string[];
  completedIds?: string[];
  checklistId?: string;
  itemName: string;
  onComplete: (checklistId: string) => void | Promise<void>;
}

function tryParseChecklistItems(beskrivelse: string | null): ChecklistItem[] | null {
  if (!beskrivelse) return null;
  try {
    const parsed = JSON.parse(beskrivelse);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.id && parsed[0]?.text) {
      return parsed as ChecklistItem[];
    }
    return null;
  } catch {
    return null;
  }
}

export const ChecklistExecutionDialog = (props: ChecklistExecutionDialogProps) => {
  const { open, onOpenChange, itemName, onComplete, completedIds = [] } = props;
  const checklistIds: string[] = props.checklistIds ?? (props.checklistId ? [props.checklistId] : []);

  const [activeChecklistId, setActiveChecklistId] = useState<string>("");
  const [checklistTitles, setChecklistTitles] = useState<Record<string, string>>({});
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [checkedByTab, setCheckedByTab] = useState<Record<string, Set<string>>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isCompleting, setIsCompleting] = useState(false);

  // File-based checklist state (image OR document)
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileMode, setFileMode] = useState<FileMode>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pdfNumPages, setPdfNumPages] = useState<number>(0);
  const [pdfContainerWidth, setPdfContainerWidth] = useState<number>(0);
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const pdfViewportRef = useRef<HTMLDivElement>(null);
  const [pdfScale, setPdfScale] = useState<number>(1);
  const [pdfOffset, setPdfOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gestureRef = useRef<{ startDist: number; startScale: number; startOffset: { x: number; y: number }; startMid: { x: number; y: number } } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; startOffset: { x: number; y: number } } | null>(null);
  const [docxHtml, setDocxHtml] = useState<string | null>(null);
  const [docxLoading, setDocxLoading] = useState(false);

  const completedChecklistIds = new Set(completedIds);
  const checkedItems: Set<string> = checkedByTab[activeChecklistId] ?? new Set();

  const isFileMode = fileUrl !== null && items.length === 0;

  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (open && !prevOpenRef.current && checklistIds.length > 0) {
      const firstIncomplete =
        checklistIds.find((id) => !completedChecklistIds.has(id)) ?? checklistIds[0];
      setActiveChecklistId(firstIncomplete);
      setCheckedByTab({});
      setPdfNumPages(0);
    }
    prevOpenRef.current = open;
  }, [open]);

  // Fetch titles
  useEffect(() => {
    if (!open || checklistIds.length === 0) return;
    const fetchTitles = async () => {
      const { data } = await supabase
        .from("documents")
        .select("id, tittel")
        .in("id", checklistIds);
      if (data) {
        const map: Record<string, string> = {};
        data.forEach((d) => { map[d.id] = d.tittel; });
        setChecklistTitles(map);
      }
    };
    fetchTitles();
  }, [open, checklistIds.join(",")]);

  // Fetch items or file for active checklist
  useEffect(() => {
    if (!open || !activeChecklistId) return;
    const fetchData = async () => {
      setIsLoading(true);
      setFileUrl(null);
      setFileMode(null);
      setFileName(null);
      setLoadError(null);
      setPdfNumPages(0);
      try {
        const { data, error } = await supabase
          .from("documents")
          .select("beskrivelse, fil_url, fil_navn")
          .eq("id", activeChecklistId)
          .single();
        if (error) throw error;

        const parsed = tryParseChecklistItems(data?.beskrivelse ?? null);
        if (parsed) {
          setItems(parsed);
          setFileUrl(null);
        } else if (data?.fil_url) {
          setItems([]);
          setFileName(data.fil_navn ?? null);
          const mode = getFileMode(data.fil_navn, data.fil_url);
          setFileMode(mode);

          // External URL — use directly
          if (data.fil_url.startsWith('http://') || data.fil_url.startsWith('https://')) {
            setFileUrl(data.fil_url);
          } else {
            const { data: signedData, error: signedError } = await supabase.storage
              .from("documents")
              .createSignedUrl(data.fil_url, 3600);
            if (signedError) {
              console.error("[ChecklistExecutionDialog] createSignedUrl failed:", signedError, "path:", data.fil_url);
              setLoadError("Kunne ikke laste sjekklistefilen. Sjekk at den er delt riktig, eller kontakt admin.");
            } else {
              setFileUrl(signedData?.signedUrl ?? null);
            }
          }
        } else {
          setItems([]);
        }
      } catch (err) {
        console.error("[ChecklistExecutionDialog] fetch failed:", err);
        setItems([]);
        setLoadError("Kunne ikke laste sjekklisten. Kontakt admin.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [open, activeChecklistId]);

  const handleTabChange = (newId: string) => {
    setActiveChecklistId(newId);
  };

  // Measure PDF container width for react-pdf rendering
  useLayoutEffect(() => {
    if (fileMode !== "pdf") return;
    const measure = () => {
      if (pdfContainerRef.current) {
        setPdfContainerWidth(pdfContainerRef.current.clientWidth);
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [fileMode, fileUrl]);

  // Reset zoom/pan when PDF changes
  useEffect(() => {
    setPdfScale(1);
    setPdfOffset({ x: 0, y: 0 });
    pointersRef.current.clear();
    gestureRef.current = null;
    panRef.current = null;
  }, [fileUrl, fileMode]);

  const clampScale = (s: number) => Math.min(5, Math.max(0.5, s));

  const applyScale = (next: number, focal?: { x: number; y: number }) => {
    const ns = clampScale(next);
    setPdfScale((prev) => {
      if (focal && pdfViewportRef.current) {
        const rect = pdfViewportRef.current.getBoundingClientRect();
        const fx = focal.x - rect.left;
        const fy = focal.y - rect.top;
        setPdfOffset((o) => {
          // keep focal point stable: new_offset = focal - (focal - old_offset) * (ns/prev)
          const ratio = ns / prev;
          const nx = fx - (fx - o.x) * ratio;
          const ny = fy - (fy - o.y) * ratio;
          return ns <= 1.001 ? { x: 0, y: 0 } : { x: nx, y: ny };
        });
      } else if (ns <= 1.001) {
        setPdfOffset({ x: 0, y: 0 });
      }
      return ns;
    });
  };

  const handlePdfPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = Array.from(pointersRef.current.values());
    if (pts.length === 2) {
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      gestureRef.current = {
        startDist: Math.hypot(dx, dy) || 1,
        startScale: pdfScale,
        startOffset: { ...pdfOffset },
        startMid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
      };
      panRef.current = null;
    } else if (pts.length === 1 && pdfScale > 1) {
      panRef.current = { startX: e.clientX, startY: e.clientY, startOffset: { ...pdfOffset } };
    }
  };

  const handlePdfPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = Array.from(pointersRef.current.values());
    if (pts.length === 2 && gestureRef.current) {
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      const dist = Math.hypot(dx, dy) || 1;
      const ratio = dist / gestureRef.current.startDist;
      const ns = clampScale(gestureRef.current.startScale * ratio);
      if (pdfViewportRef.current) {
        const rect = pdfViewportRef.current.getBoundingClientRect();
        const fx = gestureRef.current.startMid.x - rect.left;
        const fy = gestureRef.current.startMid.y - rect.top;
        const r = ns / gestureRef.current.startScale;
        const nx = fx - (fx - gestureRef.current.startOffset.x) * r;
        const ny = fy - (fy - gestureRef.current.startOffset.y) * r;
        setPdfScale(ns);
        setPdfOffset(ns <= 1.001 ? { x: 0, y: 0 } : { x: nx, y: ny });
      }
    } else if (pts.length === 1 && panRef.current && pdfScale > 1) {
      const dx = e.clientX - panRef.current.startX;
      const dy = e.clientY - panRef.current.startY;
      setPdfOffset({ x: panRef.current.startOffset.x + dx, y: panRef.current.startOffset.y + dy });
    }
  };

  const handlePdfPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) gestureRef.current = null;
    if (pointersRef.current.size === 0) panRef.current = null;
  };

  const resetPdfZoom = () => {
    setPdfScale(1);
    setPdfOffset({ x: 0, y: 0 });
  };

  // Convert .docx to HTML in browser using mammoth
  useEffect(() => {
    if (fileMode !== "docx" || !fileUrl) {
      setDocxHtml(null);
      return;
    }
    let cancelled = false;
    setDocxLoading(true);
    setDocxHtml(null);
    (async () => {
      try {
        const mammoth = await import("mammoth/mammoth.browser");
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const arrayBuffer = await res.arrayBuffer();
        const { value } = await mammoth.convertToHtml(
          { arrayBuffer },
          {
            styleMap: [
              "p[style-name='Title'] => h1.docx-title:fresh",
              "p[style-name='Subtitle'] => h2.docx-subtitle:fresh",
              "p[style-name='Heading 1'] => h2:fresh",
              "p[style-name='Heading 2'] => h3:fresh",
              "p[style-name='Heading 3'] => h4:fresh",
              "p[style-name='Heading 4'] => h5:fresh",
              "p[style-name='Quote'] => blockquote:fresh",
              "p[style-name='Intense Quote'] => blockquote.docx-intense:fresh",
              "p[style-name='List Paragraph'] => p.docx-list-p:fresh",
              "r[style-name='Strong'] => strong",
              "r[style-name='Emphasis'] => em",
              "b => strong",
              "i => em",
              "u => u",
            ],
            includeDefaultStyleMap: true,
            ignoreEmptyParagraphs: false,
          } as any,
        );
        if (!cancelled) setDocxHtml(value);
      } catch (err) {
        console.error("[ChecklistExecutionDialog] docx convert failed:", err);
        if (!cancelled) setLoadError("Kunne ikke vise Word-dokumentet. Bruk «Åpne i ny fane» for å laste det ned.");
      } finally {
        if (!cancelled) setDocxLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fileMode, fileUrl]);

  const isBrowserViewable = (mode: FileMode) => mode === "image" || mode === "pdf";

  const handleOpenFile = () => {
    if (!fileUrl) return;
    if (isBrowserViewable(fileMode)) {
      window.open(fileUrl, "_blank");
      return;
    }
    try {
      // Supabase Storage signed URLs support ?download=<filename> to force
      // Content-Disposition: attachment server-side. This works cross-origin
      // and on mobile Safari, unlike the <a download> attribute.
      const sep = fileUrl.includes("?") ? "&" : "?";
      const downloadName = encodeURIComponent(fileName || "sjekkliste");
      const downloadUrl = `${fileUrl}${sep}download=${downloadName}`;
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.rel = "noopener";
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error("[ChecklistExecutionDialog] download failed:", err);
      window.open(fileUrl, "_blank");
    }
  };

  const handleToggleItem = (itemId: string) => {
    setCheckedByTab((prev) => {
      const current = new Set(prev[activeChecklistId] ?? []);
      if (current.has(itemId)) current.delete(itemId);
      else current.add(itemId);
      return { ...prev, [activeChecklistId]: current };
    });
  };

  const allItemsChecked = isFileMode
    ? true
    : items.length > 0 && checkedItems.size === items.length;
  const checkedCount = checkedItems.size;
  const totalCount = items.length;
  const progressPercentage = totalCount > 0 ? (checkedCount / totalCount) * 100 : 0;

  const handleComplete = async () => {
    setIsCompleting(true);
    try {
      await onComplete(activeChecklistId);
      const nowCompleted = new Set([...completedChecklistIds, activeChecklistId]);
      const nextIncomplete = checklistIds.find((id) => !nowCompleted.has(id));
      if (nextIncomplete) {
        setActiveChecklistId(nextIncomplete);
      } else {
        onOpenChange(false);
      }
    } catch (error) {
      console.error("Error completing:", error);
    } finally {
      setIsCompleting(false);
    }
  };

  const showTabs = checklistIds.length > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-primary" />
            <span className="truncate">
              {showTabs
                ? itemName || "Sjekklister"
                : checklistTitles[activeChecklistId] || "Sjekkliste"}
            </span>
          </DialogTitle>
          {showTabs && (
            <p className="text-sm text-muted-foreground">
              {checklistTitles[activeChecklistId] || ""}
            </p>
          )}
          {!showTabs && itemName && (
            <p className="text-sm text-muted-foreground">{itemName}</p>
          )}
        </DialogHeader>

        {showTabs && (
          <Tabs value={activeChecklistId} onValueChange={handleTabChange}>
            <TabsList className="w-full flex-wrap h-auto gap-1">
              {checklistIds.map((id) => (
                <TabsTrigger key={id} value={id} className="flex-1 gap-1.5 text-xs whitespace-normal text-left leading-tight py-2 min-h-[2.5rem] h-auto">
                  {completedChecklistIds.has(id) && (
                    <CheckCircle2 className="h-3 w-3 text-green-600 flex-shrink-0" />
                  )}
                  <span className="line-clamp-2 break-words">{checklistTitles[id] || "…"}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        {/* Progress bar — only for JSON checklists */}
        {!isFileMode && !isLoading && items.length > 0 && (
          <div className="space-y-1 flex-shrink-0">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Fremgang</span>
              <span className="font-medium">{checkedCount} av {totalCount}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto pr-4" style={{ maxHeight: 'calc(90vh - 260px)' }}>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-muted-foreground">Laster sjekkliste...</p>
            </div>
          ) : isFileMode ? (
            /* File-based checklist (image or document) */
            <div className="space-y-4 py-2">
              {fileMode === "image" ? (
                <div className="rounded-lg border overflow-hidden">
                  <img
                    src={fileUrl!}
                    alt={checklistTitles[activeChecklistId] || "Sjekkliste"}
                    className="w-full h-auto cursor-pointer"
                    onClick={() => window.open(fileUrl!, '_blank')}
                  />
                </div>
              ) : fileMode === "pdf" ? (
                <div className="space-y-2">
                  <div
                    ref={pdfContainerRef}
                    className="relative rounded-lg border overflow-hidden bg-muted/20"
                  >
                    {/* Zoom controls */}
                    <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-md bg-background/90 backdrop-blur border shadow-sm p-1">
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => applyScale(pdfScale - 0.25)} aria-label="Zoom ut">
                        <ZoomOut className="h-4 w-4" />
                      </Button>
                      <span className="text-xs tabular-nums w-10 text-center">{Math.round(pdfScale * 100)}%</span>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => applyScale(pdfScale + 0.25)} aria-label="Zoom inn">
                        <ZoomIn className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={resetPdfZoom} aria-label="Nullstill zoom">
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </div>
                    <div
                      ref={pdfViewportRef}
                      className="overflow-hidden"
                      style={{ touchAction: "none", WebkitUserSelect: "none", userSelect: "none" }}
                      onPointerDown={handlePdfPointerDown}
                      onPointerMove={handlePdfPointerMove}
                      onPointerUp={handlePdfPointerUp}
                      onPointerCancel={handlePdfPointerUp}
                    >
                      <div
                        style={{
                          transform: `translate(${pdfOffset.x}px, ${pdfOffset.y}px) scale(${pdfScale})`,
                          transformOrigin: "0 0",
                          width: "100%",
                        }}
                      >
                        <Document
                          file={fileUrl!}
                          onLoadSuccess={({ numPages }) => setPdfNumPages(numPages)}
                          onLoadError={(err) => {
                            console.error("[ChecklistExecutionDialog] PDF load failed:", err);
                            setLoadError("Kunne ikke laste PDF. Prøv å åpne i ny fane.");
                          }}
                          loading={
                            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                              <Loader2 className="w-5 h-5 animate-spin" />
                              <span className="text-sm">Laster PDF...</span>
                            </div>
                          }
                        >
                          {Array.from({ length: pdfNumPages }, (_, i) => (
                            <Page
                              key={i + 1}
                              pageNumber={i + 1}
                              width={pdfContainerWidth || undefined}
                              renderTextLayer={false}
                              renderAnnotationLayer={false}
                              className="border-b last:border-b-0"
                            />
                          ))}
                        </Document>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2"
                    onClick={() => window.open(fileUrl!, '_blank')}
                  >
                    <ExternalLink className="w-4 h-4" />
                    Åpne i ny fane
                  </Button>
                </div>
              ) : fileMode === "docx" ? (
                <div className="space-y-2">
                  <style>{`
                    .docx-content { color: hsl(var(--foreground)); font-size: 0.9rem; line-height: 1.6; }
                    .docx-content h1, .docx-content h2, .docx-content h3, .docx-content h4, .docx-content h5 {
                      font-weight: 600; line-height: 1.25; margin: 1.2em 0 0.5em; color: hsl(var(--foreground));
                    }
                    .docx-content h1, .docx-content .docx-title { font-size: 1.5rem; }
                    .docx-content h2, .docx-content .docx-subtitle { font-size: 1.25rem; }
                    .docx-content h3 { font-size: 1.1rem; }
                    .docx-content h4 { font-size: 1rem; }
                    .docx-content h5 { font-size: 0.95rem; }
                    .docx-content p { margin: 0.5em 0; }
                    .docx-content ul, .docx-content ol { margin: 0.5em 0 0.5em 1.4em; padding: 0; }
                    .docx-content li { margin: 0.2em 0; }
                    .docx-content li > p { margin: 0; }
                    .docx-content blockquote {
                      border-left: 3px solid hsl(var(--primary) / 0.5);
                      padding: 0.25em 0.8em; margin: 0.8em 0;
                      color: hsl(var(--muted-foreground)); font-style: italic;
                      background: hsl(var(--muted) / 0.3); border-radius: 0 0.375rem 0.375rem 0;
                    }
                    .docx-content a { color: hsl(var(--primary)); text-decoration: underline; }
                    .docx-content strong { font-weight: 600; }
                    .docx-content em { font-style: italic; }
                    .docx-content img { max-width: 100%; height: auto; border-radius: 0.375rem; margin: 0.5em 0; display: block; }
                    .docx-content table {
                      border-collapse: collapse; width: 100%; margin: 0.75em 0;
                      font-size: 0.85rem; display: block; overflow-x: auto;
                    }
                    .docx-content table th, .docx-content table td {
                      border: 1px solid hsl(var(--border));
                      padding: 0.45em 0.65em; text-align: left; vertical-align: top;
                    }
                    .docx-content table th { background: hsl(var(--muted) / 0.6); font-weight: 600; }
                    .docx-content table tr:nth-child(even) td { background: hsl(var(--muted) / 0.25); }
                    .docx-content hr { border: 0; border-top: 1px solid hsl(var(--border)); margin: 1em 0; }
                    .docx-content * { word-break: break-word; overflow-wrap: anywhere; }
                  `}</style>
                  <div className="rounded-lg border bg-background p-4 overflow-x-auto">
                    {docxLoading ? (
                      <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span className="text-sm">Konverterer Word-dokument...</span>
                      </div>
                    ) : docxHtml ? (
                      <div
                        className="docx-content max-w-none"
                        dangerouslySetInnerHTML={{ __html: docxHtml }}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        Ingen innhold kunne vises.
                      </p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2"
                    onClick={handleOpenFile}
                  >
                    <Download className="w-4 h-4" />
                    Last ned dokument
                  </Button>
                </div>
              ) : (
                <div className="rounded-lg border p-4 flex flex-col items-center gap-3 bg-muted/30">
                  <FileText className="w-12 h-12 text-primary" />
                  <div className="text-center">
                    <p className="font-medium text-sm">{fileName || "Sjekklistefil"}</p>
                    <p className="text-xs text-muted-foreground">Last ned dokumentet for å gjennomgå sjekklisten</p>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={handleOpenFile}
                  >
                    <Download className="w-4 h-4" />
                    Last ned sjekkliste
                  </Button>
                </div>
              )}
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-center px-4">
              <AlertTriangle className="w-8 h-8 text-destructive" />
              <p className="text-sm text-destructive font-medium">{loadError}</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-muted-foreground">Ingen punkter i sjekklisten</p>
            </div>
          ) : (
            /* JSON-based checklist */
            <div className="space-y-3 py-2">
              {items.map((item, index) => {
                const isChecked = checkedItems.has(item.id);
                return (
                  <div
                    key={item.id}
                    role="checkbox"
                    aria-checked={isChecked}
                    tabIndex={0}
                    className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                      isChecked
                        ? 'bg-primary/10 border-primary/30'
                        : 'bg-background/50 border-border hover:bg-muted/50'
                    }`}
                    onClick={() => handleToggleItem(item.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleToggleItem(item.id);
                      }
                    }}
                  >
                    <div className="flex items-center justify-center mt-0.5">
                      {isChecked ? (
                        <CheckCircle2 className="w-5 h-5 text-primary" />
                      ) : (
                        <Circle className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1">
                      <span className={`text-sm ${isChecked ? 'line-through text-muted-foreground' : ''}`}>
                        {index + 1}. {item.text}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button
            onClick={handleComplete}
            disabled={!allItemsChecked || isCompleting}
            className="gap-2"
          >
            {isCompleting ? (
              "Fullfører..."
            ) : allItemsChecked ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Fullfør
              </>
            ) : isFileMode ? (
              "Marker sjekklisten som utført"
            ) : (
              `Kryss av alle punkter (${checkedCount}/${totalCount})`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
