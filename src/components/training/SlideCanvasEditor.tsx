import { useState, useRef, useCallback, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import ImageResize from "tiptap-extension-resize-image";
import FontSize from "@tiptap/extension-font-size";
import { TextStyle } from "@tiptap/extension-text-style";
import { Button } from "@/components/ui/button";
import {
  Type, ImagePlus, Trash2,
  Bold, Italic, Underline as UnderlineIcon,
  Heading1, Heading2, Heading3, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight,
  ArrowRight, ArrowDown, ArrowUp, ArrowLeft as ArrowLeftIcon,
  Minus, Square, Circle, GripHorizontal,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// --- Types ---
export interface CanvasElement {
  id: string;
  type: "text" | "image" | "shape";
  x: number;
  y: number;
  width: number;
  height: number;
  content?: any; // TipTap JSONContent for text
  src?: string;  // URL for image
  shapeType?: "arrow-right" | "arrow-down" | "arrow-up" | "arrow-left" | "rect" | "circle" | "line";
  shapeColor?: string;
}

export interface CanvasData {
  elements: CanvasElement[];
}

interface Props {
  data: CanvasData;
  onChange: (data: CanvasData) => void;
}

const CANVAS_W = 1920;
const CANVAS_H = 1080;

const genId = () => Math.random().toString(36).slice(2, 10);

const FONT_SIZES = ["14px", "18px", "24px", "32px", "40px", "56px", "72px"];

// --- Inline TipTap for text elements (no toolbar inside — toolbar is external) ---
const InlineTextEditor = ({
  content,
  onChange,
  onEditorReady,
}: {
  content: any;
  onChange: (c: any) => void;
  onEditorReady: (editor: any) => void;
}) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: "Skriv tekst..." }),
      TextStyle,
      FontSize,
      ImageResize,
    ],
    content: content || undefined,
    onUpdate: ({ editor }) => onChange(editor.getJSON()),
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none h-full overflow-auto p-3",
      },
      handleScrollToSelection: () => true,
    },
  });

  useEffect(() => {
    if (editor) onEditorReady(editor);
  }, [editor]);

  useEffect(() => {
    if (editor && content && JSON.stringify(editor.getJSON()) !== JSON.stringify(content)) {
      editor.commands.setContent(content);
    }
  }, [content]);

  if (!editor) return null;

  return (
    <div className="h-full overflow-auto" onMouseDown={(e) => e.stopPropagation()}>
      <EditorContent editor={editor} className="h-full" />
    </div>
  );
};

// --- Floating text toolbar rendered outside the canvas ---
const FloatingTextToolbar = ({ editor }: { editor: any }) => {
  if (!editor) return null;

  const currentFontSize = editor.getAttributes("textStyle").fontSize || "18px";

  const ToolBtn = ({ active, onClick, children, title }: { active?: boolean; onClick: () => void; children: React.ReactNode; title?: string }) => (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={`p-1.5 rounded ${active ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-accent/15 hover:text-foreground"}`}
    >
      {children}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 rounded-lg border bg-popover shadow-md">
      <select
        value={currentFontSize}
        onChange={(e) => editor.chain().focus().setFontSize(e.target.value).run()}
        className="h-7 text-sm border rounded bg-background px-1.5 mr-1 cursor-pointer"
      >
        {FONT_SIZES.map((s) => (
          <option key={s} value={s}>{parseInt(s)}px</option>
        ))}
      </select>

      <div className="w-px h-5 bg-border mx-0.5" />

      <ToolBtn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="Fet"><Bold className="h-4 w-4" /></ToolBtn>
      <ToolBtn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="Kursiv"><Italic className="h-4 w-4" /></ToolBtn>
      <ToolBtn active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Understreking"><UnderlineIcon className="h-4 w-4" /></ToolBtn>

      <div className="w-px h-5 bg-border mx-0.5" />

      <ToolBtn active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="H1"><Heading1 className="h-4 w-4" /></ToolBtn>
      <ToolBtn active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="H2"><Heading2 className="h-4 w-4" /></ToolBtn>
      <ToolBtn active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="H3"><Heading3 className="h-4 w-4" /></ToolBtn>

      <div className="w-px h-5 bg-border mx-0.5" />

      <ToolBtn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Kulepunkter"><List className="h-4 w-4" /></ToolBtn>
      <ToolBtn active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Nummerert liste"><ListOrdered className="h-4 w-4" /></ToolBtn>

      <div className="w-px h-5 bg-border mx-0.5" />

      <ToolBtn active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()} title="Venstre"><AlignLeft className="h-4 w-4" /></ToolBtn>
      <ToolBtn active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()} title="Sentrer"><AlignCenter className="h-4 w-4" /></ToolBtn>
      <ToolBtn active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()} title="Høyre"><AlignRight className="h-4 w-4" /></ToolBtn>
    </div>
  );
};

// --- Shape renderer ---
const ShapeRenderer = ({ el }: { el: CanvasElement }) => {
  const color = el.shapeColor || "hsl(var(--primary))";

  switch (el.shapeType) {
    case "arrow-right":
      return (
        <svg viewBox="0 0 100 60" className="w-full h-full" preserveAspectRatio="none">
          <polygon points="0,15 70,15 70,0 100,30 70,60 70,45 0,45" fill={color} />
        </svg>
      );
    case "arrow-down":
      return (
        <svg viewBox="0 0 60 100" className="w-full h-full" preserveAspectRatio="none">
          <polygon points="15,0 45,0 45,70 60,70 30,100 0,70 15,70" fill={color} />
        </svg>
      );
    case "arrow-up":
      return (
        <svg viewBox="0 0 60 100" className="w-full h-full" preserveAspectRatio="none">
          <polygon points="30,0 60,30 45,30 45,100 15,100 15,30 0,30" fill={color} />
        </svg>
      );
    case "arrow-left":
      return (
        <svg viewBox="0 0 100 60" className="w-full h-full" preserveAspectRatio="none">
          <polygon points="0,30 30,0 30,15 100,15 100,45 30,45 30,60" fill={color} />
        </svg>
      );
    case "rect":
      return (
        <div className="w-full h-full rounded border-4" style={{ borderColor: color, backgroundColor: `${color}15` }} />
      );
    case "circle":
      return (
        <div className="w-full h-full rounded-full border-4" style={{ borderColor: color, backgroundColor: `${color}15` }} />
      );
    case "line":
      return (
        <svg viewBox="0 0 100 10" className="w-full h-full" preserveAspectRatio="none">
          <line x1="0" y1="5" x2="100" y2="5" stroke={color} strokeWidth="4" />
        </svg>
      );
    default:
      return null;
  }
};

// --- Main Canvas Editor ---
export const SlideCanvasEditor = ({ data, onChange }: Props) => {
  const { companyId } = useAuth();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{ id: string; startX: number; startY: number; elX: number; elY: number } | null>(null);
  const [resizeState, setResizeState] = useState<{ id: string; startX: number; startY: number; elW: number; elH: number; elX: number; elY: number; corner: string } | null>(null);
  const [containerWidth, setContainerWidth] = useState(960);
  const [showShapePicker, setShowShapePicker] = useState(false);
  const textEditorRefs = useRef<Record<string, any>>({});

  const scale = containerWidth / CANVAS_W;
  const elements = data.elements || [];

  useEffect(() => {
    if (!canvasRef.current) return;
    const ro = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, []);

  const updateElement = useCallback((id: string, patch: Partial<CanvasElement>) => {
    onChange({ elements: elements.map((el) => (el.id === id ? { ...el, ...patch } : el)) });
  }, [elements, onChange]);

  const addTextBox = () => {
    const el: CanvasElement = {
      id: genId(), type: "text",
      x: 100 + Math.random() * 200, y: 100 + Math.random() * 200,
      width: 600, height: 300,
      content: { type: "doc", content: [{ type: "paragraph" }] },
    };
    onChange({ elements: [...elements, el] });
    setSelectedId(el.id);
  };

  const addShape = (shapeType: CanvasElement["shapeType"]) => {
    const sizes: Record<string, { w: number; h: number }> = {
      "arrow-right": { w: 200, h: 120 },
      "arrow-down": { w: 120, h: 200 },
      "arrow-up": { w: 120, h: 200 },
      "arrow-left": { w: 200, h: 120 },
      "rect": { w: 300, h: 200 },
      "circle": { w: 200, h: 200 },
      "line": { w: 400, h: 20 },
    };
    const s = sizes[shapeType!] || { w: 200, h: 200 };
    const el: CanvasElement = {
      id: genId(), type: "shape",
      x: 300 + Math.random() * 200, y: 300 + Math.random() * 200,
      width: s.w, height: s.h,
      shapeType,
      shapeColor: "hsl(var(--primary))",
    };
    onChange({ elements: [...elements, el] });
    setSelectedId(el.id);
    setShowShapePicker(false);
  };

  const addImage = useCallback(async () => {
    if (!companyId) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const ext = file.name.split(".").pop();
      const path = `${companyId}/training-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("logbook-images").upload(path, file);
      if (error) { toast.error("Bildeopplasting feilet"); return; }
      const { data: urlData } = supabase.storage.from("logbook-images").getPublicUrl(path);
      const img = new Image();
      img.onload = () => {
        const aspect = img.width / img.height;
        const w = Math.min(800, img.width);
        const h = w / aspect;
        const el: CanvasElement = {
          id: genId(), type: "image",
          x: 200, y: 200, width: w, height: h,
          src: urlData.publicUrl,
        };
        onChange({ elements: [...elements, el] });
        setSelectedId(el.id);
      };
      img.src = urlData.publicUrl;
    };
    input.click();
  }, [companyId, elements, onChange]);

  const deleteSelected = () => {
    if (!selectedId) return;
    onChange({ elements: elements.filter((el) => el.id !== selectedId) });
    setSelectedId(null);
  };

  // Bring to front / send to back
  const bringToFront = () => {
    if (!selectedId) return;
    const idx = elements.findIndex(el => el.id === selectedId);
    if (idx === elements.length - 1) return;
    const newEls = [...elements];
    const [el] = newEls.splice(idx, 1);
    newEls.push(el);
    onChange({ elements: newEls });
  };

  const sendToBack = () => {
    if (!selectedId) return;
    const idx = elements.findIndex(el => el.id === selectedId);
    if (idx === 0) return;
    const newEls = [...elements];
    const [el] = newEls.splice(idx, 1);
    newEls.unshift(el);
    onChange({ elements: newEls });
  };

  const handleMouseDown = useCallback((e: React.MouseEvent, el: CanvasElement) => {
    if ((e.target as HTMLElement).dataset.resize) return;
    e.preventDefault();
    setSelectedId(el.id);
    setDragState({ id: el.id, startX: e.clientX, startY: e.clientY, elX: el.x, elY: el.y });
  }, []);

  const handleResizeDown = useCallback((e: React.MouseEvent, el: CanvasElement, corner: string) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(el.id);
    setResizeState({ id: el.id, startX: e.clientX, startY: e.clientY, elW: el.width, elH: el.height, elX: el.x, elY: el.y, corner });
  }, []);

  useEffect(() => {
    if (!dragState && !resizeState) return;
    const handleMove = (e: MouseEvent) => {
      if (dragState) {
        const dx = (e.clientX - dragState.startX) / scale;
        const dy = (e.clientY - dragState.startY) / scale;
        updateElement(dragState.id, { x: Math.round(Math.max(0, Math.min(CANVAS_W, dragState.elX + dx))), y: Math.round(Math.max(0, Math.min(CANVAS_H, dragState.elY + dy))) });
      }
      if (resizeState) {
        const dx = (e.clientX - resizeState.startX) / scale;
        const dy = (e.clientY - resizeState.startY) / scale;
        let newW = resizeState.elW, newH = resizeState.elH, newX = resizeState.elX, newY = resizeState.elY;
        if (resizeState.corner.includes("r")) newW = Math.max(80, resizeState.elW + dx);
        if (resizeState.corner.includes("b")) newH = Math.max(40, resizeState.elH + dy);
        if (resizeState.corner.includes("l")) { newW = Math.max(80, resizeState.elW - dx); newX = resizeState.elX + dx; }
        if (resizeState.corner.includes("t")) { newH = Math.max(40, resizeState.elH - dy); newY = resizeState.elY + dy; }
        updateElement(resizeState.id, { width: Math.round(newW), height: Math.round(newH), x: Math.round(newX), y: Math.round(newY) });
      }
    };
    const handleUp = () => { setDragState(null); setResizeState(null); };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => { window.removeEventListener("mousemove", handleMove); window.removeEventListener("mouseup", handleUp); };
  }, [dragState, resizeState, scale, updateElement]);

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) { setSelectedId(null); setShowShapePicker(false); }
  };

  const resizeHandles = (el: CanvasElement) => {
    const corners = ["tl", "tr", "bl", "br"];
    const cursors: Record<string, string> = { tl: "nwse-resize", tr: "nesw-resize", bl: "nesw-resize", br: "nwse-resize" };
    const positions: Record<string, React.CSSProperties> = {
      tl: { top: -6, left: -6 }, tr: { top: -6, right: -6 },
      bl: { bottom: -6, left: -6 }, br: { bottom: -6, right: -6 },
    };
    return corners.map((c) => (
      <div
        key={c} data-resize="true"
        className="absolute w-3 h-3 bg-primary border-2 border-primary-foreground rounded-sm z-10"
        style={{ ...positions[c], cursor: cursors[c] }}
        onMouseDown={(e) => handleResizeDown(e, el, c.replace("t", "t").replace("b", "b").replace("l", "l").replace("r", "r"))}
      />
    ));
  };

  const selectedEl = elements.find(el => el.id === selectedId);

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 p-2 rounded-lg border bg-muted/30">
        <Button type="button" variant="outline" size="sm" onClick={addTextBox}>
          <Type className="h-3.5 w-3.5 mr-1" /> Tekstboks
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={addImage}>
          <ImagePlus className="h-3.5 w-3.5 mr-1" /> Bilde
        </Button>

        {/* Shape picker */}
        <div className="relative">
          <Button type="button" variant="outline" size="sm" onClick={() => setShowShapePicker(!showShapePicker)}>
            <ArrowRight className="h-3.5 w-3.5 mr-1" /> Grafikk
          </Button>
          {showShapePicker && (
            <div className="absolute top-full left-0 mt-1 bg-popover border rounded-lg shadow-lg p-2 z-50 flex flex-wrap gap-1 w-48">
              <button type="button" onClick={() => addShape("arrow-right")} className="p-2 hover:bg-accent/15 rounded" title="Pil høyre">
                <ArrowRight className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => addShape("arrow-down")} className="p-2 hover:bg-accent/15 rounded" title="Pil ned">
                <ArrowDown className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => addShape("arrow-up")} className="p-2 hover:bg-accent/15 rounded" title="Pil opp">
                <ArrowUp className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => addShape("arrow-left")} className="p-2 hover:bg-accent/15 rounded" title="Pil venstre">
                <ArrowLeftIcon className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => addShape("rect")} className="p-2 hover:bg-accent/15 rounded" title="Rektangel">
                <Square className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => addShape("circle")} className="p-2 hover:bg-accent/15 rounded" title="Sirkel">
                <Circle className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => addShape("line")} className="p-2 hover:bg-accent/15 rounded" title="Linje">
                <Minus className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>

        {selectedId && (
          <div className="flex items-center gap-1 ml-auto">
            {selectedEl?.type === "shape" && (
              <input
                type="color"
                value={selectedEl.shapeColor?.startsWith("#") ? selectedEl.shapeColor : "#3b82f6"}
                onChange={(e) => updateElement(selectedId, { shapeColor: e.target.value })}
                className="w-7 h-7 rounded border cursor-pointer"
                title="Farge"
              />
            )}
            <Button type="button" variant="ghost" size="sm" onClick={bringToFront} title="Fremst" className="h-7 px-2 text-xs">
              Frem
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={sendToBack} title="Bakerst" className="h-7 px-2 text-xs">
              Bak
            </Button>
            <Button type="button" variant="outline" size="sm" className="text-destructive" onClick={deleteSelected}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Slett
            </Button>
          </div>
        )}
      </div>

      {/* Floating text toolbar — shown above canvas when a text element is selected */}
      {selectedId && selectedEl?.type === "text" && textEditorRefs.current[selectedId] && (
        <FloatingTextToolbar editor={textEditorRefs.current[selectedId]} />
      )}

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="relative w-full border rounded-lg overflow-hidden bg-white"
        style={{ aspectRatio: `${CANVAS_W}/${CANVAS_H}` }}
        onClick={handleCanvasClick}
      >
        <div
          style={{ width: CANVAS_W, height: CANVAS_H, transform: `scale(${scale})`, transformOrigin: "top left" }}
          className="absolute top-0 left-0"
        >
          {elements.map((el) => {
            const isSelected = el.id === selectedId;
            return (
              <div
                key={el.id}
                className={`absolute ${isSelected ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-primary/40"}`}
                style={{ left: el.x, top: el.y, width: el.width, height: el.height }}
              >
                {el.type === "text" && (
                  <div className="w-full h-full flex flex-col bg-transparent rounded overflow-hidden border border-transparent hover:border-muted">
                    {/* Drag handle bar */}
                    <div
                      className="h-6 bg-muted/40 hover:bg-muted/70 cursor-grab active:cursor-grabbing flex items-center justify-center shrink-0 border-b border-muted/30"
                      onMouseDown={(e) => handleMouseDown(e, el)}
                    >
                      <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-h-0">
                      <InlineTextEditor
                        content={el.content}
                        onChange={(c) => updateElement(el.id, { content: c })}
                        onEditorReady={(ed) => { textEditorRefs.current[el.id] = ed; }}
                      />
                    </div>
                  </div>
                )}
                {el.type === "image" && (
                  <img
                    src={el.src} alt=""
                    className="w-full h-full object-contain rounded pointer-events-none select-none" draggable={false}
                    onMouseDown={(e) => handleMouseDown(e, el)}
                  />
                )}
                {el.type === "shape" && (
                  <div className="w-full h-full pointer-events-none select-none">
                    <ShapeRenderer el={el} />
                  </div>
                )}
                {/* Click overlay for non-text elements to select + drag */}
                {el.type !== "text" && (
                  <div
                    className="absolute inset-0"
                    style={{ cursor: dragState?.id === el.id ? "grabbing" : "grab" }}
                    onMouseDown={(e) => handleMouseDown(e, el)}
                    onClick={(e) => { e.stopPropagation(); setSelectedId(el.id); }}
                  />
                )}
                {el.type === "text" && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    onClick={(e) => { e.stopPropagation(); setSelectedId(el.id); }}
                  />
                )}
                {isSelected && resizeHandles(el)}
              </div>
            );
          })}

          {elements.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/50 pointer-events-none">
              <p className="text-lg">Klikk «Tekstboks», «Bilde» eller «Grafikk» for å legge til elementer</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
