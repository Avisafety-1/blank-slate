import { useState, useRef, useCallback, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import { Button } from "@/components/ui/button";
import {
  Type, ImagePlus, Trash2,
  Bold, Italic, Underline as UnderlineIcon,
  Heading1, Heading2, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// --- Types ---
export interface CanvasElement {
  id: string;
  type: "text" | "image";
  x: number;
  y: number;
  width: number;
  height: number;
  content?: any; // TipTap JSONContent for text
  src?: string;  // URL for image
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

// --- Inline TipTap for text elements ---
const InlineTextEditor = ({
  content,
  onChange,
  width,
  height,
  scale,
}: {
  content: any;
  onChange: (c: any) => void;
  width: number;
  height: number;
  scale: number;
}) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2] } }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: "Skriv tekst..." }),
    ],
    content: content || undefined,
    onUpdate: ({ editor }) => onChange(editor.getJSON()),
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none h-full overflow-auto p-2",
        style: `font-size: ${Math.max(14, 16 / scale)}px`,
      },
    },
  });

  useEffect(() => {
    if (editor && content && JSON.stringify(editor.getJSON()) !== JSON.stringify(content)) {
      editor.commands.setContent(content);
    }
  }, [content]);

  if (!editor) return null;

  return (
    <div className="h-full flex flex-col">
      {/* Mini toolbar */}
      <div
        className="flex items-center gap-0.5 px-1 py-0.5 border-b bg-muted/50 shrink-0"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {[
          { icon: Bold, action: () => editor.chain().focus().toggleBold().run(), active: editor.isActive("bold") },
          { icon: Italic, action: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive("italic") },
          { icon: UnderlineIcon, action: () => editor.chain().focus().toggleUnderline().run(), active: editor.isActive("underline") },
          { icon: Heading1, action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), active: editor.isActive("heading", { level: 1 }) },
          { icon: Heading2, action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), active: editor.isActive("heading", { level: 2 }) },
          { icon: List, action: () => editor.chain().focus().toggleBulletList().run(), active: editor.isActive("bulletList") },
          { icon: ListOrdered, action: () => editor.chain().focus().toggleOrderedList().run(), active: editor.isActive("orderedList") },
          { icon: AlignLeft, action: () => editor.chain().focus().setTextAlign("left").run(), active: editor.isActive({ textAlign: "left" }) },
          { icon: AlignCenter, action: () => editor.chain().focus().setTextAlign("center").run(), active: editor.isActive({ textAlign: "center" }) },
          { icon: AlignRight, action: () => editor.chain().focus().setTextAlign("right").run(), active: editor.isActive({ textAlign: "right" }) },
        ].map(({ icon: Icon, action, active }, i) => (
          <button
            key={i}
            type="button"
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); action(); }}
            className={`p-0.5 rounded ${active ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Icon className="h-3 w-3" />
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto" onMouseDown={(e) => e.stopPropagation()}>
        <EditorContent editor={editor} className="h-full" />
      </div>
    </div>
  );
};

// --- Main Canvas Editor ---
export const SlideCanvasEditor = ({ data, onChange }: Props) => {
  const { companyId } = useAuth();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{ id: string; startX: number; startY: number; elX: number; elY: number } | null>(null);
  const [resizeState, setResizeState] = useState<{ id: string; startX: number; startY: number; elW: number; elH: number; elX: number; elY: number; corner: string } | null>(null);
  const [containerWidth, setContainerWidth] = useState(960);

  const scale = containerWidth / CANVAS_W;
  const elements = data.elements || [];

  // Observe container width
  useEffect(() => {
    if (!canvasRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, []);

  const updateElement = useCallback((id: string, patch: Partial<CanvasElement>) => {
    onChange({
      elements: elements.map((el) => (el.id === id ? { ...el, ...patch } : el)),
    });
  }, [elements, onChange]);

  const addTextBox = () => {
    const el: CanvasElement = {
      id: genId(),
      type: "text",
      x: 100 + Math.random() * 200,
      y: 100 + Math.random() * 200,
      width: 500,
      height: 250,
      content: { type: "doc", content: [{ type: "paragraph" }] },
    };
    onChange({ elements: [...elements, el] });
    setSelectedId(el.id);
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
          id: genId(),
          type: "image",
          x: 200,
          y: 200,
          width: w,
          height: h,
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

  // Convert mouse position to canvas coordinates
  const toCanvasCoords = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { cx: 0, cy: 0 };
    return {
      cx: (clientX - rect.left) / scale,
      cy: (clientY - rect.top) / scale,
    };
  }, [scale]);

  // Drag handlers
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
        const newX = Math.max(0, Math.min(CANVAS_W, dragState.elX + dx));
        const newY = Math.max(0, Math.min(CANVAS_H, dragState.elY + dy));
        updateElement(dragState.id, { x: Math.round(newX), y: Math.round(newY) });
      }
      if (resizeState) {
        const dx = (e.clientX - resizeState.startX) / scale;
        const dy = (e.clientY - resizeState.startY) / scale;
        let newW = resizeState.elW;
        let newH = resizeState.elH;
        let newX = resizeState.elX;
        let newY = resizeState.elY;

        if (resizeState.corner.includes("r")) newW = Math.max(100, resizeState.elW + dx);
        if (resizeState.corner.includes("b")) newH = Math.max(60, resizeState.elH + dy);
        if (resizeState.corner.includes("l")) {
          newW = Math.max(100, resizeState.elW - dx);
          newX = resizeState.elX + dx;
        }
        if (resizeState.corner.includes("t")) {
          newH = Math.max(60, resizeState.elH - dy);
          newY = resizeState.elY + dy;
        }
        updateElement(resizeState.id, { width: Math.round(newW), height: Math.round(newH), x: Math.round(newX), y: Math.round(newY) });
      }
    };

    const handleUp = () => {
      setDragState(null);
      setResizeState(null);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragState, resizeState, scale, updateElement]);

  // Click on canvas background deselects
  const handleCanvasClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) setSelectedId(null);
  };

  const resizeHandles = (el: CanvasElement) => {
    const corners = ["tl", "tr", "bl", "br"];
    const cursors: Record<string, string> = { tl: "nwse-resize", tr: "nesw-resize", bl: "nesw-resize", br: "nwse-resize" };
    const positions: Record<string, React.CSSProperties> = {
      tl: { top: -5, left: -5 },
      tr: { top: -5, right: -5 },
      bl: { bottom: -5, left: -5 },
      br: { bottom: -5, right: -5 },
    };
    return corners.map((c) => (
      <div
        key={c}
        data-resize="true"
        className="absolute w-2.5 h-2.5 bg-primary border border-primary-foreground rounded-sm z-10"
        style={{ ...positions[c], cursor: cursors[c] }}
        onMouseDown={(e) => handleResizeDown(e, el, c.includes("t") ? "t" : "b" + (c.includes("l") ? "l" : "r"))}
      />
    ));
  };

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30">
        <Button type="button" variant="outline" size="sm" onClick={addTextBox}>
          <Type className="h-3.5 w-3.5 mr-1" />
          Tekstboks
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={addImage}>
          <ImagePlus className="h-3.5 w-3.5 mr-1" />
          Bilde
        </Button>
        {selectedId && (
          <Button type="button" variant="outline" size="sm" className="text-destructive ml-auto" onClick={deleteSelected}>
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Slett
          </Button>
        )}
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="relative w-full border rounded-lg overflow-hidden bg-white"
        style={{ aspectRatio: `${CANVAS_W}/${CANVAS_H}` }}
        onClick={handleCanvasClick}
      >
        {/* Scaled inner container */}
        <div
          style={{
            width: CANVAS_W,
            height: CANVAS_H,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
          className="absolute top-0 left-0"
        >
          {elements.map((el) => {
            const isSelected = el.id === selectedId;

            return (
              <div
                key={el.id}
                className={`absolute group ${isSelected ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-primary/40"}`}
                style={{
                  left: el.x,
                  top: el.y,
                  width: el.width,
                  height: el.height,
                  cursor: dragState?.id === el.id ? "grabbing" : "grab",
                }}
                onMouseDown={(e) => handleMouseDown(e, el)}
                onClick={(e) => { e.stopPropagation(); setSelectedId(el.id); }}
              >
                {el.type === "text" && (
                  <div className="w-full h-full bg-transparent rounded overflow-hidden border border-transparent hover:border-muted">
                    <InlineTextEditor
                      content={el.content}
                      onChange={(c) => updateElement(el.id, { content: c })}
                      width={el.width}
                      height={el.height}
                      scale={scale}
                    />
                  </div>
                )}
                {el.type === "image" && (
                  <img
                    src={el.src}
                    alt=""
                    className="w-full h-full object-contain rounded pointer-events-none select-none"
                    draggable={false}
                  />
                )}
                {isSelected && resizeHandles(el)}
              </div>
            );
          })}

          {elements.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/50 pointer-events-none">
              <p className="text-lg">Klikk «Tekstboks» eller «Bilde» for å legge til elementer</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
