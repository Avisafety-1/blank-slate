import { useRef, useState, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import type { CanvasData, CanvasElement } from "./SlideCanvasEditor";

const CANVAS_W = 1920;
const CANVAS_H = 1080;

const ReadonlyText = ({ content }: { content: any }) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2] } }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: content || undefined,
    editable: false,
    editorProps: {
      attributes: { class: "prose prose-sm max-w-none p-2" },
    },
  });

  useEffect(() => {
    if (editor && content) editor.commands.setContent(content);
  }, [content, editor]);

  if (!editor) return null;
  return <EditorContent editor={editor} />;
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
        style={{
          width: CANVAS_W,
          height: CANVAS_H,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
        className="absolute top-0 left-0"
      >
        {elements.map((el) => (
          <div
            key={el.id}
            className="absolute"
            style={{ left: el.x, top: el.y, width: el.width, height: el.height }}
          >
            {el.type === "text" && <ReadonlyText content={el.content} />}
            {el.type === "image" && (
              <img src={el.src} alt="" className="w-full h-full object-contain" draggable={false} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
