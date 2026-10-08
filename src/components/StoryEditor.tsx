import { useEffect, useRef, useState } from "react";
import Image from "@tiptap/extension-image";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Heading2, Heading3, ImagePlus, Italic, Link2, List, ListOrdered, Minus, Quote, Redo2, Strikethrough, Underline as UnderlineIcon, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { uploadStoryImage } from "@/lib/storyImage";

interface Props {
  /** HTML to start from. Change `resetKey` to load a different document. */
  html: string;
  resetKey: string;
  onChange: (html: string, text: string) => void;
}

function Btn({ onClick, active, title, children, label }: { onClick: () => void; active?: boolean; title: string; children: React.ReactNode; label?: string }) {
  return (
    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onClick} title={title} aria-label={title} aria-pressed={active}
      className={cn("flex h-10 min-w-[2.5rem] shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-semibold transition-colors hover:bg-muted lg:h-9 lg:min-w-[2.25rem]", active && "bg-primary/15 text-primary")}>
      {children}{label && <span className="hidden xl:inline">{label}</span>}
    </button>
  );
}
const Sep = () => <span className="mx-0.5 h-6 w-px shrink-0 bg-border" aria-hidden="true" />;

/**
 * The story writer: a proper rich-text editor. On a computer it has a full toolbar with keyboard shortcuts (Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+Z);
 * on a phone the same toolbar scrolls sideways with bigger buttons. Headings, bold, italic, underline, lists, quotes, links and dividers.
 */
export default function StoryEditor({ html, resetKey, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const editor = useEditor({
    extensions: [Image.configure({ inline: false, allowBase64: false, HTMLAttributes: { loading: "lazy" } }), StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: "nofollow ugc noopener", target: "_blank" } } })],
    content: html,
    editorProps: {
      attributes: {
        class: "story-prose min-h-[320px] px-4 py-4 text-[17px] leading-8 focus:outline-none sm:px-6 lg:min-h-[420px] lg:text-[18px] lg:leading-9",
        "aria-label": "Your story",
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getHTML(), e.getText()),
  });

  // load a different document (a new draft, or another story being edited) without recreating the editor
  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(html, { emitUpdate: false });
    onChange(editor.getHTML(), editor.getText());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, editor]);

  if (!editor) return <div className="h-72 animate-pulse rounded-xl bg-muted" />;
  const c = () => editor.chain().focus();
  const addImage = async (file: File) => {
    setUploading(true);
    try { const src = await uploadStoryImage(file); c().setImage({ src, alt: "" }).run(); }
    catch (e) { toast({ title: "Picture not added", description: (e as Error).message, variant: "destructive" }); }
    finally { setUploading(false); }
  };
  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link address (https://…). Leave empty to remove the link.", prev ?? "https://");
    if (url === null) return;
    if (!url.trim() || url.trim() === "https://") { c().extendMarkRange("link").unsetLink().run(); return; }
    if (!/^https?:\/\//i.test(url.trim())) return;
    c().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
      <div className="sticky top-0 z-10 flex items-center gap-0.5 overflow-x-auto border-b border-border bg-muted/60 px-1.5 py-1 backdrop-blur [scrollbar-width:thin]" role="toolbar" aria-label="Formatting">
        <Btn title="Big heading" label="Heading" active={editor.isActive("heading", { level: 2 })} onClick={() => c().toggleHeading({ level: 2 }).run()}><Heading2 className="h-4 w-4" /></Btn>
        <Btn title="Small heading" label="Subheading" active={editor.isActive("heading", { level: 3 })} onClick={() => c().toggleHeading({ level: 3 }).run()}><Heading3 className="h-4 w-4" /></Btn>
        <Sep />
        <Btn title="Bold (Ctrl+B)" active={editor.isActive("bold")} onClick={() => c().toggleBold().run()}><Bold className="h-4 w-4" /></Btn>
        <Btn title="Italic (Ctrl+I)" active={editor.isActive("italic")} onClick={() => c().toggleItalic().run()}><Italic className="h-4 w-4" /></Btn>
        <Btn title="Underline (Ctrl+U)" active={editor.isActive("underline")} onClick={() => c().toggleUnderline().run()}><UnderlineIcon className="h-4 w-4" /></Btn>
        <Btn title="Strike through" active={editor.isActive("strike")} onClick={() => c().toggleStrike().run()}><Strikethrough className="h-4 w-4" /></Btn>
        <Sep />
        <Btn title="Bullet list" active={editor.isActive("bulletList")} onClick={() => c().toggleBulletList().run()}><List className="h-4 w-4" /></Btn>
        <Btn title="Numbered list" active={editor.isActive("orderedList")} onClick={() => c().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></Btn>
        <Btn title="Quote" active={editor.isActive("blockquote")} onClick={() => c().toggleBlockquote().run()}><Quote className="h-4 w-4" /></Btn>
        <Btn title="Divider line" onClick={() => c().setHorizontalRule().run()}><Minus className="h-4 w-4" /></Btn>
        <Btn title={uploading ? "Uploading…" : "Add a picture"} onClick={() => fileRef.current?.click()}><ImagePlus className={cn("h-4 w-4", uploading && "animate-pulse text-primary")} /></Btn>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void addImage(f); e.target.value = ""; }} />
        <Btn title="Add a link" active={editor.isActive("link")} onClick={setLink}><Link2 className="h-4 w-4" /></Btn>
        <Sep />
        <Btn title="Undo (Ctrl+Z)" onClick={() => c().undo().run()}><Undo2 className="h-4 w-4" /></Btn>
        <Btn title="Redo (Ctrl+Y)" onClick={() => c().redo().run()}><Redo2 className="h-4 w-4" /></Btn>
      </div>
      <div className="relative">
        {editor.isEmpty && <p className="pointer-events-none absolute left-4 top-4 text-[17px] leading-8 text-muted-foreground sm:left-6 lg:text-[18px]">Tell it your way. What happened? What did you learn? What would you tell someone starting out?</p>}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
