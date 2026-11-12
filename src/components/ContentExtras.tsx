import { useEffect, useMemo, useState } from "react";
import { Lock, Timer } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { sanitizeEmbed } from "@/components/PublishingSettings";

export interface ExtrasData {
  countdown?: { enabled: boolean; label?: string; start_datetime?: string; end_datetime?: string; target_datetime?: string; display_style: "banner" | "inline" | "floating" } | null;
  html_embed?: { position: "top" | "bottom" | "both"; code: string; vimeo_url?: string } | null;
  password_protected?: boolean;
  access_password?: string;
  toc_enabled?: boolean;
  reading_time_minutes?: number;
}

function useCountdown(start?: string, end?: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!start && !end) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [start, end]);
  const startMs = start ? new Date(start).getTime() : NaN;
  const endMs = end ? new Date(end).getTime() : NaN;
  const target = Number.isFinite(startMs) && now < startMs ? startMs : Number.isFinite(endMs) ? endMs : startMs;
  if (!Number.isFinite(target)) return null;
  const diff = Math.max(0, target - now);
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);
  const phase = Number.isFinite(startMs) && now < startMs ? "before" : Number.isFinite(endMs) && now <= endMs ? "active" : "ended";
  return { days, hours, minutes, seconds, phase, expired: phase === "ended" };
}

export function Countdown({ data }: { data: ExtrasData["countdown"] }) {
  const c = data;
  const start = c?.start_datetime || c?.target_datetime;
  const end = c?.end_datetime;
  const cd = useCountdown(start, end);
  if (!c?.enabled || !cd || cd.expired) return null;
  const style = c.display_style || "banner";
  const label = cd.phase === "before" ? (c.label || "Starts in") : "Ends in";
  const inner = (
    <span className="inline-flex items-center gap-2 text-sm font-semibold">
      <Timer className="h-4 w-4" />
      {label}: {cd.days}d {cd.hours}h {cd.minutes}m {cd.seconds}s
    </span>
  );
  if (style === "floating") {
    return (
      <div className="fixed bottom-4 left-4 z-40 rounded-full border border-border bg-primary px-4 py-2 text-primary-foreground shadow-lg">
        {inner}
      </div>
    );
  }
  if (style === "inline") {
    return <div className="my-4 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-primary">{inner}</div>;
  }
  return (
    <div className="-mx-4 mb-4 bg-primary px-4 py-3 text-center text-primary-foreground sm:mx-0 sm:rounded-lg">
      {inner}
    </div>
  );
}

export function VimeoEmbed({ url }: { url?: string }) {
  if (!url) return null;
  let source: URL;
  try {
    source = new URL(url);
  } catch {
    return null;
  }
  if (source.protocol !== "https:" || !["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(source.hostname)) return null;

  const match = source.pathname.match(/(?:video\/)?(\d{6,})/);
  const id = match?.[1];
  if (!id) return null;

  const player = new URL(`https://player.vimeo.com/video/${id}`);
  const hash = source.searchParams.get("h");
  if (hash) player.searchParams.set("h", hash);

  return (
    <div className="my-6 not-prose overflow-hidden rounded-xl border border-border bg-black shadow-sm">
      <div className="aspect-video w-full">
        <iframe
          src={player.toString()}
          title="Vimeo video"
          className="h-full w-full"
          loading="lazy"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    </div>
  );
}

export function HtmlEmbed({ data, position }: { data: ExtrasData["html_embed"]; position: "top" | "bottom" }) {
  if (!data?.code) return null;
  const matches = data.position === "both" || data.position === position;
  if (!matches) return null;
  const safe = sanitizeEmbed(data.code);
  return <div className="my-4 not-prose" dangerouslySetInnerHTML={{ __html: safe }} />;
}

/** Wraps children behind a password input. Unlock persists per slug in localStorage. */
export function PasswordGate({
  enabled, password, storageKey, children,
}: { enabled?: boolean; password?: string; storageKey: string; children: React.ReactNode }) {
  const key = `pwgate_${storageKey}`;
  const [unlocked, setUnlocked] = useState(() => {
    if (!enabled) return true;
    try { return localStorage.getItem(key) === "1"; } catch { return false; }
  });
  const [input, setInput] = useState("");
  const [err, setErr] = useState("");

  if (!enabled || !password) return <>{children}</>;
  if (unlocked) return <>{children}</>;

  return (
    <div className="mx-auto my-10 max-w-sm rounded-2xl border border-border bg-card p-6 text-center">
      <Lock className="mx-auto mb-3 h-8 w-8 text-primary" />
      <h2 className="mb-1 font-serif text-lg font-bold text-foreground">Password protected</h2>
      <p className="mb-4 text-sm text-muted-foreground">Enter the password your tutor shared to view this content.</p>
      <Input
        type="password"
        value={input}
        onChange={(e) => { setInput(e.target.value); setErr(""); }}
        placeholder="Password"
        className="mb-2"
      />
      {err && <p className="mb-2 text-xs text-destructive">{err}</p>}
      <Button
        className="w-full"
        onClick={() => {
          if (input === password) {
            try { localStorage.setItem(key, "1"); } catch {}
            setUnlocked(true);
          } else {
            setErr("Wrong password — try again.");
          }
        }}
      >Unlock</Button>
    </div>
  );
}

/** Generates an anchored TOC from markdown content. */
export function ContentToc({ content }: { content: string }) {
  const items = useMemo(() => {
    const out: { level: number; text: string; id: string }[] = [];
    for (const line of String(content || "").split(/\r?\n/)) {
      const m = line.trim().match(/^(#{2,3})\s+(.+)$/);
      if (!m) continue;
      const level = m[1].length;
      // Match ArticleLines: remove section numbering from H2 labels, but retain
      // subsection numbering (e.g. 4.1) because it is part of the H3 anchor.
      let text = m[2].trim().replace(/^\*+|\*+$/g, "").replace(/\*+/g, "").replace(/⭐+/g, "").trim();
      if (level === 2) text = text.replace(/^\d+\.\s*/, "").replace(/^[IVXLC]+\.\s+/i, "").trim();
      if (!text) continue;
      const id = text.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
      out.push({ level, text, id });
    }
    return out;
  }, [content]);
  if (!items.length) return null;
  return (
    <nav aria-label="Table of contents" className="my-5 lg:hidden">
      <details className="group overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-bold text-foreground [&::-webkit-details-marker]:hidden">
          <span>On this page</span>
          <span className="shrink-0 text-xs font-semibold text-muted-foreground group-open:hidden">{items.length} sections ▾</span>
          <span className="hidden shrink-0 text-xs font-semibold text-muted-foreground group-open:inline">Hide ▴</span>
        </summary>
        <ul className="max-h-[55vh] space-y-1 overflow-y-auto border-t border-border px-4 py-3 text-sm">
          {items.map((it, i) => (
            <li key={i} className={it.level === 3 ? "pl-5" : "pt-1"}>
              <a href={`#${it.id}`} className={it.level === 3 ? "block border-l border-border py-1.5 pl-3 leading-snug text-muted-foreground hover:text-primary" : "block py-1.5 font-semibold leading-snug text-foreground hover:text-primary"}>
                {it.text}
              </a>
            </li>
          ))}
        </ul>
      </details>
    </nav>
  );
}

export function ReadingTimeBadge({ minutes }: { minutes?: number }) {
  if (!minutes || minutes < 1) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      ~{minutes} min read
    </span>
  );
}