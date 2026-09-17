import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Image from "@tiptap/extension-image";
import { useRef } from "react";
import { Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, Quote, Heading2, Heading3, Undo, Redo, ImagePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadImageToR2 } from "@/lib/r2";

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}

function ToolbarBtn({
  onClick,
  active,
  children,
  title,
}: {
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "rounded p-1.5 transition-colors hover:bg-muted",
        active && "bg-primary/10 text-primary"
      )}
    >
      {children}
    </button>
  );
}

export default function RichTextEditor({ content, onChange, placeholder, className }: RichTextEditorProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Underline,
      Image.configure({ inline: false, allowBase64: true }),
    ],
    content,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none min-h-[280px] px-4 py-3 focus:outline-none text-foreground",
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of Array.from(items)) {
          if (item.type.startsWith("image/")) {
            event.preventDefault();
            const file = item.getAsFile();
            if (!file) continue;
            uploadImageToR2(file).then((src) => {
              if (src && editor) editor.chain().focus().setImage({ src }).run();
            });
            return true;
          }
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  if (!editor) return null;

  const iconSize = "h-4 w-4";

  const handleFile = async (file: File) => {
    const src = await uploadImageToR2(file);
    if (src) editor.chain().focus().setImage({ src }).run();
  };

  return (
    <div className={cn("rounded-xl border border-border bg-background overflow-hidden", className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/30 px-2 py-1.5">
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold">
          <Bold className={iconSize} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic">
          <Italic className={iconSize} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Underline">
          <UnderlineIcon className={iconSize} />
        </ToolbarBtn>
        <div className="mx-1 h-5 w-px bg-border" />
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="Heading">
          <Heading2 className={iconSize} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} title="Subheading">
          <Heading3 className={iconSize} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bullet List">
          <List className={iconSize} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Numbered List">
          <ListOrdered className={iconSize} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="Quote">
          <Quote className={iconSize} />
        </ToolbarBtn>
        <div className="mx-1 h-5 w-px bg-border" />
        <ToolbarBtn onClick={() => fileRef.current?.click()} title="Insert image">
          <ImagePlus className={iconSize} />
        </ToolbarBtn>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        <div className="mx-1 h-5 w-px bg-border" />
        <ToolbarBtn onClick={() => editor.chain().focus().undo().run()} title="Undo">
          <Undo className={iconSize} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().redo().run()} title="Redo">
          <Redo className={iconSize} />
        </ToolbarBtn>
      </div>
      {/* Editor */}
      <EditorContent editor={editor} />
    </div>
  );
}
