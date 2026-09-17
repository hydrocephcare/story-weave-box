import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { X, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface PreviewItem {
  title: string;
  description: string;
  path: string;
  thumbnail?: string;
}

interface Ctx {
  open: (path: string, fallbackTitle: string) => void;
}

const DeepPreviewContext = createContext<Ctx | null>(null);

export function useDeepLinkPreview() {
  return useContext(DeepPreviewContext);
}

export function DeepLinkPreviewProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<PreviewItem | null>(null);
  const [loading, setLoading] = useState(false);
  const savedScroll = useRef<number>(0);

  const open = useCallback(async (path: string, fallbackTitle: string) => {
    savedScroll.current = window.scrollY;
    setItem({ title: fallbackTitle, description: "", path });
    setLoading(true);
    try {
      // Determine type from path
      const segMatch = path.match(/^\/(blog|mcqs|flashcards|stories)\/([^#?]+)/);
      if (!segMatch) return;
      const [, kind, rest] = segMatch;
      const slug = rest.split("-").slice(-10).join("-"); // last chunk for slugged ids
      const table = kind === "blog" ? "articles" : kind === "mcqs" ? "mcq_sets" : kind === "flashcards" ? "flashcard_sets" : "stories";
      const { data } = await supabase
        .from(table as any)
        .select("title, meta_description, og_image_url, slug")
        .or(`slug.eq.${slug},title.ilike.%${fallbackTitle.replace(/[%_]/g, "")}%`)
        .limit(1)
        .maybeSingle();
      if (data) {
        setItem({
          title: (data as any).title || fallbackTitle,
          description: (data as any).meta_description || "",
          path,
          thumbnail: (data as any).og_image_url || undefined,
        });
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  const close = useCallback(() => {
    setItem(null);
    // Restore scroll precisely
    requestAnimationFrame(() => window.scrollTo({ top: savedScroll.current, behavior: "auto" }));
  }, []);

  // Esc to close
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [item, close]);

  return (
    <DeepPreviewContext.Provider value={{ open }}>
      {children}
      {item && (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
          onClick={close}
        >
          <div
            className="relative w-full max-w-md rounded-t-2xl border border-border bg-card p-5 shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={close}
              className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close preview"
            >
              <X className="h-4 w-4" />
            </button>
            {item.thumbnail && (
              <img src={item.thumbnail} alt="" className="mb-3 h-32 w-full rounded-lg object-cover" loading="lazy" />
            )}
            <h3 className="pr-8 font-serif text-lg font-bold text-foreground">{item.title}</h3>
            <p className="mt-2 line-clamp-4 text-sm text-muted-foreground">
              {loading ? "Loading preview…" : (item.description || "Tap below to open the full article.")}
            </p>
            <Link
              to={item.path}
              onClick={close}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Read full article <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}
    </DeepPreviewContext.Provider>
  );
}