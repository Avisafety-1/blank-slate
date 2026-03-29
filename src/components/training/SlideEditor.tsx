import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import ImageResize from "tiptap-extension-resize-image";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import { Button } from "@/components/ui/button";
import {
  Bold, Italic, Underline as UnderlineIcon, Heading1, Heading2, Heading3,
  List, ListOrdered, ImagePlus, AlignLeft, AlignCenter, AlignRight,
  Minus, ArrowRight, ArrowDown, ArrowUp, ArrowLeft as ArrowLeftIcon,
  Quote, Type
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useCallback, useEffect } from "react";
import type { JSONContent } from "@tiptap/react";

interface Props {
  content: JSONContent | null;
  onChange: (content: JSONContent) => void;
  placeholder?: string;
}

export const SlideEditor = ({ content, onChange, placeholder = "Skriv innhold her..." }: Props) => {
  const { companyId } = useAuth();

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      ImageResize,
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder }),
    ],
    content: content || undefined,
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON());
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm sm:prose max-w-none focus:outline-none min-h-[120px] p-3",
      },
      handleScrollToSelection: () => true,
    },
  });

  // Sync external content changes
  useEffect(() => {
    if (editor && content && JSON.stringify(editor.getJSON()) !== JSON.stringify(content)) {
      editor.commands.setContent(content, false, { preserveWhitespace: "full" });
    }
  }, [content, editor]);

  const handleImageUpload = useCallback(async () => {
    if (!companyId || !editor) return;
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
      (editor.chain().focus() as any).setImage({ src: urlData.publicUrl }).run();
    };
    input.click();
  }, [companyId, editor]);

  const insertArrow = useCallback((arrow: string) => {
    editor?.chain().focus().insertContent(arrow + " ").run();
  }, [editor]);

  const insertInfoBox = useCallback((color: string) => {
    editor?.chain().focus().insertContent({
      type: "blockquote",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Informasjon..." }] }],
    }).run();
  }, [editor]);

  if (!editor) return null;

  const ToolBtn = ({ active, onClick, children, title }: { active?: boolean; onClick: () => void; children: React.ReactNode; title?: string }) => (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="sm"
      className="h-7 w-7 p-0"
      onClick={onClick}
      title={title}
    >
      {children}
    </Button>
  );

  return (
    <div className="border rounded-lg overflow-hidden bg-background">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 p-1.5 border-b bg-muted/30">
        <ToolBtn active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Overskrift 1">
          <Heading1 className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Overskrift 2">
          <Heading2 className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Overskrift 3">
          <Heading3 className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn active={editor.isActive("paragraph")} onClick={() => editor.chain().focus().setParagraph().run()} title="Brødtekst">
          <Type className="h-3.5 w-3.5" />
        </ToolBtn>

        <div className="w-px h-5 bg-border mx-1" />

        <ToolBtn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="Fet">
          <Bold className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="Kursiv">
          <Italic className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Understreking">
          <UnderlineIcon className="h-3.5 w-3.5" />
        </ToolBtn>

        <div className="w-px h-5 bg-border mx-1" />

        <ToolBtn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Kulepunkter">
          <List className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Nummerert liste">
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolBtn>

        <div className="w-px h-5 bg-border mx-1" />

        <ToolBtn active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()} title="Venstrejuster">
          <AlignLeft className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()} title="Sentrer">
          <AlignCenter className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()} title="Høyrejuster">
          <AlignRight className="h-3.5 w-3.5" />
        </ToolBtn>

        <div className="w-px h-5 bg-border mx-1" />

        <ToolBtn onClick={handleImageUpload} title="Sett inn bilde">
          <ImagePlus className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Inforamme / sitat">
          <Quote className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Skillelinje">
          <Minus className="h-3.5 w-3.5" />
        </ToolBtn>

        <div className="w-px h-5 bg-border mx-1" />

        <ToolBtn onClick={() => insertArrow("→")} title="Pil høyre">
          <ArrowRight className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => insertArrow("↓")} title="Pil ned">
          <ArrowDown className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => insertArrow("↑")} title="Pil opp">
          <ArrowUp className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => insertArrow("←")} title="Pil venstre">
          <ArrowLeftIcon className="h-3.5 w-3.5" />
        </ToolBtn>
      </div>

      {/* Editor content */}
      <EditorContent editor={editor} />
    </div>
  );
};
