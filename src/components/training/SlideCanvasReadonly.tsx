import { useRef, useState, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import ImageResize from "tiptap-extension-resize-image";
import type { CanvasData, CanvasElement } from "./SlideCanvasEditor";

const CANVAS_W = 1920;
const CANVAS_H = 1080;

const ReadonlyText = ({ content }: { content: any }) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: content || undefined,
    editable: false,
    editorProps: {
      attributes: { class: "prose prose-sm max-w-none p-3" },
    },
  });

  useEffect(() => {
    if (editor && content) editor.commands.setContent(content);
  }, [content, editor]);

  if (!editor) return null;
  return <EditorContent editor={editor} />;
};

const ShapeReadonly = ({ el }: { el: CanvasElement }) => {
  const color = el.shapeColor || "#3b82f6";
  switch (el.shapeType) {
    case "arrow-right":
      return <svg viewBox="0 0 100 60" className="w-full h-full" preserveAspectRatio="none"><polygon points="0,15 70,15 70,0 100,30 70,60 70,45 0,45" fill={color} /></svg>;
    case "arrow-down":
      return <svg viewBox="0 0 60 100" className="w-full h-full" preserveAspectRatio="none"><polygon points="15,0 45,0 45,70 60,70 30,100 0,70 15,70" fill={color} /></svg>;
    case "arrow-up":
      return <svg viewBox="0 0 60 100" className="w-full h-full" preserveAspectRatio="none"><polygon points="30,0 60,30 45,30 45,100 15,100 15,30 0,30" fill={color} /></svg>;
    case "arrow-left":
      return <svg viewBox="0 0 100 60" className="w-full h-full" preserveAspectRatio="none"><polygon points="0,30 30,0 30,15 100,15 100,45 30,45 30,60" fill={color} /></svg>;
    case "rect":
      return <div className="w-full h-full rounded border-4" style={{ borderColor: color, backgroundColor: `${color}15` }} />;
    case "circle":
      return <div className="w-full h-full rounded-full border-4" style={{ borderColor: color, backgroundColor: `${color}15` }} />;
    case "line":
      return <svg viewBox="0 0 100 10" className="w-full h-full" preserveAspectRatio="none"><line x1="0" y1="5" x2="100" y2="5" stroke={color} strokeWidth="4" /></svg>;
    default:
      return null;
  }
};

interface Props {
  data: CanvasData;
  className?: string;
}

export const SlideCanvasReadonly = ({ data, className = "" }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(960);

  const scale = containerWidth / CANVAS_W;
  const elements = data?.elements || [];

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative w-full border rounded-lg overflow-hidden bg-white ${className}`}
      style={{ aspectRatio: `${CANVAS_W}/${CANVAS_H}` }}
    >
      <div
        style={{ width: CANVAS_W, height: CANVAS_H, transform: `scale(${scale})`, transformOrigin: "top left" }}
        className="absolute top-0 left-0"
      >
        {elements.map((el) => (
          <div key={el.id} className="absolute" style={{ left: el.x, top: el.y, width: el.width, height: el.height }}>
            {el.type === "text" && <ReadonlyText content={el.content} />}
            {el.type === "image" && <img src={el.src} alt="" className="w-full h-full object-contain" draggable={false} />}
            {el.type === "shape" && <ShapeReadonly el={el} />}
          </div>
        ))}
      </div>
    </div>
  );
};
