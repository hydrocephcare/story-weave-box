import { Link } from "react-router-dom";
import { ShieldCheck, AlertTriangle } from "lucide-react";
import checks from "@/data/contentChecks.json";
import marks from "@/data/contentMarks.json";

type Issue = { severity: "high" | "medium" | "low"; where: string; problem: string; fix: string };
type Entry = { at: string; model: string; validated: boolean; high: number; medium: number; issues: Issue[] };

/**
 * /admin/content-checks: what the second AI found when it cross-checked each note. A note with no serious issue carries the "AI cross-checked" mark;
 * the others are listed here with what is wrong and the suggested fix, worst first. The check is a safety net: it is not a doctor's review.
 */
export default function AdminContentChecks() {
  const all = Object.entries((checks as unknown as { notes: Record<string, Entry> }).notes ?? {});
  const marked = new Set(Object.keys((marks as { notes: Record<string, string> }).notes ?? {}));
  const withIssues = all.filter(([, e]) => e.issues.length).sort((a, b) => b[1].high - a[1].high || b[1].medium - a[1].medium);
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Link to="/admin/tools" className="text-sm font-semibold text-primary hover:underline">← Admin tools</Link>
      <h1 className="mt-2 font-serif text-4xl font-bold">Content checks</h1>
      <p className="mt-2 text-[16px] text-muted-foreground">A second AI (a different model from the writer) cross-checks the notes a few at a time every day. {all.length} checked so far; {marked.size} carry the “AI cross-checked” mark. The check is a safety net and is not a doctor’s review.</p>
      <ul className="mt-6 space-y-4">
        {withIssues.map(([slug, e]) => (
          <li key={slug} className="rounded-2xl border border-border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Link to={`/notes/${slug}`} className="font-semibold hover:underline">{slug}</Link>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${e.high ? "bg-red-500/15 text-red-700 dark:text-red-300" : "bg-amber-500/15 text-amber-700 dark:text-amber-300"}`}><AlertTriangle className="mr-1 inline h-3 w-3" aria-hidden />{e.high} serious · {e.medium} to review</span>
              <span className="text-xs text-muted-foreground">{e.at} · {e.model}</span>
            </div>
            <ul className="mt-3 space-y-2 text-[15px]">
              {e.issues.filter((i) => i.severity !== "low").map((i, k) => (
                <li key={k}><span className="font-bold">{i.severity === "high" ? "Serious" : "Review"}:</span> {i.problem}<br /><span className="text-muted-foreground">In: {i.where}</span><br /><span className="text-emerald-700 dark:text-emerald-300">Suggested: {i.fix}</span></li>
              ))}
            </ul>
          </li>
        ))}
        {!withIssues.length && <li className="flex items-center gap-2 rounded-2xl border border-border p-4 text-muted-foreground"><ShieldCheck className="h-5 w-5 text-emerald-600" aria-hidden /> Nothing flagged so far.</li>}
      </ul>
    </main>
  );
}
