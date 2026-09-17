import { useState, useEffect, useMemo, type ReactNode } from "react";
import { ChevronDown, Calendar, Lock, Code2, Tag, Image as ImageIcon, Clock, ListTree, MessageSquare, Timer, Eye, GraduationCap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import DOMPurify from "dompurify";

export interface PublishingExtras {
  countdown?: { enabled: boolean; label?: string; start_datetime?: string; end_datetime?: string; target_datetime?: string; display_style: "banner" | "inline" | "floating" } | null;
  html_embed?: { position: "top" | "bottom" | "both"; code: string } | null;
  password_protected?: boolean;
  access_password?: string;
  scheduled_at?: string | null;
  tags?: string[];
  featured_image?: string;
  reading_time_minutes?: number;
  toc_enabled?: boolean;
  comments_enabled?: boolean;
  // Source & attribution (past-paper origin)
  university?: string;
  school?: string;
  lecturer?: string;
  exam_type?: string;
  exam_year?: string;
  unit?: string;
}

export function sanitizeEmbed(html: string): string {
  return DOMPurify.sanitize(html || "", {
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form"],
    FORBID_ATTR: ["onclick", "onerror", "onload", "onmouseover", "onfocus", "onblur", "style"],
    ALLOW_DATA_ATTR: false,
  });
}

export function computeReadingTime(content: string): number {
  const words = String(content || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

function normalizeTags(input: string | string[] | undefined): string[] {
  const raw = Array.isArray(input) ? input : String(input || "").split(",");
  const seen = new Set<string>();
  return raw.map((t) => t.trim()).filter((t) => {
    const key = t.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

function Panel({ icon, title, badge, defaultOpen, children }: { icon: ReactNode; title: string; badge?: string; defaultOpen?: boolean; children: ReactNode }) {
  // Default every panel open so editors immediately see all publishing settings.
  const [open, setOpen] = useState(defaultOpen === undefined ? true : !!defaultOpen);
  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <span className="text-primary">{icon}</span>
          {title}
          {badge && <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">{badge}</span>}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="border-t border-border px-3 py-3 space-y-2">{children}</div>}
    </div>
  );
}

interface Props {
  value: PublishingExtras;
  onChange: (next: PublishingExtras) => void;
  content: string;
}

export default function PublishingSettingsPanel({ value, onChange, content }: Props) {
  const v = value || {};
  const set = <K extends keyof PublishingExtras>(k: K, val: PublishingExtras[K]) => onChange({ ...v, [k]: val });

  const readingTime = useMemo(() => computeReadingTime(content), [content]);
  useEffect(() => {
    if (v.reading_time_minutes !== readingTime) {
      onChange({ ...v, reading_time_minutes: readingTime });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readingTime]);

  const tocItems = useMemo(() => {
    const out: { level: number; text: string }[] = [];
    for (const line of String(content || "").split(/\r?\n/)) {
      const m = line.match(/^(#{2,3})\s+(.+)$/);
      if (m) out.push({ level: m[1].length, text: m[2].trim() });
    }
    return out;
  }, [content]);

  const countdown = v.countdown || { enabled: false, label: "Exam starts in", start_datetime: "", end_datetime: "", display_style: "banner" as const };
  const embed = v.html_embed || { position: "bottom" as const, code: "" };

  return (
    <div className="space-y-2">
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1">Publishing Settings</h3>

      <Panel icon={<Eye className="h-3.5 w-3.5" />} title="Visibility & Schedule" defaultOpen>
        <label className="text-[10px] font-medium text-muted-foreground block">Scheduled publish (optional)</label>
        <Input
          type="datetime-local"
          value={v.scheduled_at ? v.scheduled_at.slice(0, 16) : ""}
          onChange={(e) => set("scheduled_at", e.target.value ? new Date(e.target.value).toISOString() : null)}
          className="h-7 text-xs"
        />
        <p className="text-[10px] text-muted-foreground">Leave empty to publish immediately when the Published toggle is on.</p>
      </Panel>

      <Panel icon={<GraduationCap className="h-3.5 w-3.5" />} title="Source & Attribution" defaultOpen>
        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <label className="text-[10px] font-medium text-muted-foreground block">University</label>
            <Input value={v.university || ""} onChange={(e) => set("university", e.target.value)} placeholder="e.g. Mount Kenya University" className="h-7 text-xs" list="lm-uni" />
            <datalist id="lm-uni">
              <option value="Mount Kenya University" />
              <option value="University of Nairobi" />
              <option value="Kenyatta University" />
              <option value="JKUAT" />
              <option value="Moi University" />
              <option value="Egerton University" />
              <option value="Maseno University" />
            </datalist>
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground block">School / Faculty</label>
            <Input value={v.school || ""} onChange={(e) => set("school", e.target.value)} placeholder="School of Medicine" className="h-7 text-xs" />
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground block">Unit</label>
            <Input value={v.unit || ""} onChange={(e) => set("unit", e.target.value)} placeholder="e.g. Chemical Pathology" className="h-7 text-xs" />
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground block">Lecturer</label>
            <Input value={v.lecturer || ""} onChange={(e) => set("lecturer", e.target.value)} placeholder="Dr. J. Mutiso" className="h-7 text-xs" />
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground block">Exam Type</label>
            <select
              value={v.exam_type || ""}
              onChange={(e) => set("exam_type", e.target.value)}
              className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="">—</option>
              <option value="CAT">CAT</option>
              <option value="Past Paper">Past Paper</option>
              <option value="Mock Exam">Mock Exam</option>
              <option value="End of Semester">End of Semester</option>
              <option value="Revision">Revision</option>
              <option value="Notes">Notes only</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground block">Exam Year</label>
            <Input value={v.exam_year || ""} onChange={(e) => set("exam_year", e.target.value)} placeholder="2024" className="h-7 text-xs" />
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">Shown as attribution chips on the article / MCQ page. Helps SEO and reader trust.</p>
      </Panel>

      <Panel icon={<ImageIcon className="h-3.5 w-3.5" />} title="Featured Image / Thumbnail">
        <Input
          value={v.featured_image || ""}
          onChange={(e) => set("featured_image", e.target.value)}
          placeholder="https://..."
          className="h-7 text-xs"
        />
        {v.featured_image && (
          <img src={v.featured_image} alt="" className="h-20 w-full rounded-md border border-border object-cover" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />
        )}
        <p className="text-[10px] text-muted-foreground">Shown on listing cards. Falls back to OG image / first image.</p>
      </Panel>

      <Panel icon={<Tag className="h-3.5 w-3.5" />} title="Tags">
        <Input
          value={(v.tags || []).join(", ")}
          onChange={(e) => set("tags", normalizeTags(e.target.value))}
          placeholder="pathology, mku, year 3"
          className="h-7 text-xs"
        />
        <p className="text-[10px] text-muted-foreground">Maximum 8 tags. They appear under the article and open Google searches.</p>
        {(v.tags || []).length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {(v.tags || []).map((t, i) => (
              <span key={i} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-foreground">{t}</span>
            ))}
          </div>
        )}
      </Panel>

      <Panel icon={<Timer className="h-3.5 w-3.5" />} title="Countdown Timer" badge={countdown.enabled ? "On" : undefined}>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={countdown.enabled} onChange={(e) => set("countdown", { ...countdown, enabled: e.target.checked })} />
          Enable countdown
        </label>
        {countdown.enabled && (
          <>
            <Input value={countdown.label || ""} onChange={(e) => set("countdown", { ...countdown, label: e.target.value })} placeholder="Exam starts in" className="h-7 text-xs" />
            <label className="text-[10px] font-medium text-muted-foreground block">Start time</label>
            <Input
              type="datetime-local"
              value={(countdown.start_datetime || countdown.target_datetime || "").slice(0, 16)}
              onChange={(e) => set("countdown", { ...countdown, start_datetime: e.target.value ? new Date(e.target.value).toISOString() : "", target_datetime: e.target.value ? new Date(e.target.value).toISOString() : "" })}
              className="h-7 text-xs"
            />
            <label className="text-[10px] font-medium text-muted-foreground block">Stop / end time</label>
            <Input
              type="datetime-local"
              value={countdown.end_datetime ? countdown.end_datetime.slice(0, 16) : ""}
              onChange={(e) => set("countdown", { ...countdown, end_datetime: e.target.value ? new Date(e.target.value).toISOString() : "" })}
              className="h-7 text-xs"
            />
            <select
              value={countdown.display_style}
              onChange={(e) => set("countdown", { ...countdown, display_style: e.target.value as any })}
              className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="banner">Banner (top)</option>
              <option value="inline">Inline (above content)</option>
              <option value="floating">Floating badge</option>
            </select>
          </>
        )}
      </Panel>

      <Panel icon={<Lock className="h-3.5 w-3.5" />} title="Password Protection" badge={v.password_protected ? "Locked" : undefined}>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={!!v.password_protected} onChange={(e) => set("password_protected", e.target.checked)} />
          Require password to view
        </label>
        {v.password_protected && (
          <Input
            value={v.access_password || ""}
            onChange={(e) => set("access_password", e.target.value)}
            placeholder="Set a password"
            className="h-7 text-xs"
          />
        )}
      </Panel>

      <Panel icon={<Code2 className="h-3.5 w-3.5" />} title="HTML Embed Block">
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-700 dark:text-amber-300">
          Scripts and unsafe attributes are automatically removed for security.
        </div>
        <select
          value={embed.position}
          onChange={(e) => set("html_embed", { ...embed, position: e.target.value as any })}
          className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="top">Position: Top</option>
          <option value="bottom">Position: Bottom</option>
          <option value="both">Position: Both</option>
        </select>
        <Textarea
          value={embed.code}
          onChange={(e) => set("html_embed", { ...embed, code: e.target.value })}
          placeholder="<div class='announcement'>...</div>"
          className="min-h-[80px] font-mono text-[11px]"
        />
      </Panel>

      <Panel icon={<MessageSquare className="h-3.5 w-3.5" />} title="Comments">
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={v.comments_enabled !== false} onChange={(e) => set("comments_enabled", e.target.checked)} />
          Allow comments
        </label>
      </Panel>

      <Panel icon={<Clock className="h-3.5 w-3.5" />} title="Reading Time" badge={`~${readingTime} min`}>
        <p className="text-xs text-muted-foreground">
          Auto-calculated from word count (200 wpm). Displayed on the article page.
        </p>
      </Panel>

      <Panel icon={<ListTree className="h-3.5 w-3.5" />} title="Table of Contents" badge={v.toc_enabled ? "On" : undefined}>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={!!v.toc_enabled} onChange={(e) => set("toc_enabled", e.target.checked)} />
          Show TOC at top of article
        </label>
        {v.toc_enabled && tocItems.length > 0 && (
          <ul className="max-h-32 overflow-y-auto rounded-md border border-border bg-muted/40 p-2 text-[11px] space-y-0.5">
            {tocItems.map((it, i) => (
              <li key={i} className={it.level === 3 ? "pl-3 text-muted-foreground" : "font-medium text-foreground"}>{it.text}</li>
            ))}
          </ul>
        )}
        {v.toc_enabled && tocItems.length === 0 && (
          <p className="text-[10px] text-muted-foreground">Add H2/H3 headings to your content to populate this list.</p>
        )}
      </Panel>
    </div>
  );
}