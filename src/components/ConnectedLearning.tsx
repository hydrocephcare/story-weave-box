import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, ClipboardList, FileText, GraduationCap, Link2, Network, Presentation, Film } from "lucide-react";
import { loadGraph, relatedTo, type Draft, type GNode, type Related } from "@/lib/connections";
import { disciplineById, systemById } from "@/lib/concepts";

export function NodeIcon({ n, className = "h-4 w-4" }: { n: GNode; className?: string }) {
  const Icon = n.type === "note" ? BookOpen : n.type === "quiz" ? GraduationCap : n.type === "topic" ? ClipboardList : n.fileKind === "ppt" ? Presentation : n.fileKind === "video" ? Film : FileText;
  return <Icon className={`${className} shrink-0 text-primary`} aria-hidden="true" />;
}

export function NodeRow({ n, onNavigate }: { n: GNode; onNavigate?: () => void }) {
  return (
    <Link to={n.href} onClick={onNavigate} className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-primary/5">
      <NodeIcon n={n} />
      <span className="min-w-0 flex-1">
        <span className="block break-words text-[13px] font-semibold leading-snug text-foreground group-hover:text-primary">{n.title}</span>
        <span className="block truncate text-[10px] text-muted-foreground">{n.label}{n.year ? ` · Year ${n.year}` : ""} · {n.where.replace(/^Year \d\s*[:›]\s*/, "")}</span>
      </span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-primary opacity-40 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden="true" />
    </Link>
  );
}

function useRelated(draft: Draft, enabled: boolean): Related | null | undefined {
  const [rel, setRel] = useState<Related | null | undefined>(undefined);
  const key = `${draft.id ?? ""}|${draft.title}|${draft.where ?? ""}|${draft.year ?? ""}`;
  useEffect(() => {
    if (!enabled) return;
    let on = true;
    loadGraph().then((g) => { if (on) setRel(relatedTo(g, draft)); }).catch(() => { if (on) setRel(null); });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  return rel;
}

interface Props { target: Draft; /** Collapsed behind a button until asked for (outline topics, folders). */ compact?: boolean; className?: string; onNavigate?: () => void }

/** "Learn it together": the same topic elsewhere on the site, then the same body system through every other discipline. */
export default function ConnectedLearning({ target, compact = false, className = "", onNavigate }: Props) {
  const [open, setOpen] = useState(!compact);
  const rel = useRelated(target, open);
  const has = useMemo(() => Boolean(rel && (rel.topic.length || rel.lenses.length || rel.companions.length)), [rel]);

  if (compact && !open) {
    return <button type="button" onClick={() => setOpen(true)} className={`inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] font-bold text-primary hover:border-primary/50 ${className}`}><Link2 className="h-3 w-3" /> Connected</button>;
  }
  if (rel === null) return null;
  if (rel === undefined) return <div className={`space-y-2 ${className}`} aria-busy="true"><div className="h-4 w-40 animate-pulse rounded bg-muted" /><div className="h-10 animate-pulse rounded-lg bg-muted" /><div className="h-10 animate-pulse rounded-lg bg-muted" /></div>;
  if (!has) return compact ? <p className={`text-[11px] text-muted-foreground ${className}`}>No connections found yet.</p> : null;

  return (
    <section className={`border-t border-border pt-4 ${className}`} aria-label="Connected learning">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-foreground"><Network className="h-4 w-4 text-primary" /> Connected learning</h3>
        {rel.systems.map((s) => {
          const def = systemById(s);
          return <Link key={s} to={`/study-map/${s}`} className="rounded-full bg-card px-2 py-0.5 text-[10px] font-bold text-primary ring-1 ring-primary/30 hover:bg-primary hover:text-primary-foreground">{def.emoji} {def.label} map</Link>;
        })}
      </div>

      {rel.topic.length > 0 && (
        <div className="mb-2">
          <p className="px-2 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Same topic — notes, files &amp; quizzes</p>
          {rel.topic.slice(0, compact ? 4 : 6).map((n) => <NodeRow key={n.id} n={n} onNavigate={onNavigate} />)}
        </div>
      )}

      {rel.lenses.map((l) => {
        const d = disciplineById(l.discipline);
        return (
          <div key={l.discipline} className="mb-2">
            <p className="px-2 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Study with {d.label} <span className="font-semibold normal-case tracking-normal">— {d.question}</span></p>
            {l.items.map((n) => <NodeRow key={n.id} n={n} onNavigate={onNavigate} />)}
          </div>
        );
      })}

      {rel.companions.map((l) => {
        const d = disciplineById(l.discipline);
        return (
          <div key={l.discipline} className="mb-2">
            <p className="px-2 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Goes hand in hand with {d.label}</p>
            {l.items.map((n) => <NodeRow key={n.id} n={n} onNavigate={onNavigate} />)}
          </div>
        );
      })}

      <Link to="/study-map" className="mt-1 inline-flex items-center gap-1 px-2 text-[11px] font-bold text-primary hover:underline">Open the Study map <ArrowRight className="h-3 w-3" /></Link>
    </section>
  );
}
