import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Scale } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { auditBank, balanceBank, validateBankChange } from "../../supabase/functions/_shared/mcqPositions.js";

interface Row { id: string; title: string; category: string; source_type: string | null; published: boolean; updated_at: string | null; questions: unknown[] }
type Audit = ReturnType<typeof auditBank>;

const db = supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const LETTERS = "ABCDE";
const pct = (c: number, n: number) => (n ? `${Math.round((c / n) * 100)}%` : "–");
const ISSUE: Record<string, string> = {
  "all-one-letter": "every answer is the same letter",
  uneven: "letters clearly uneven",
  "one-letter-dominates": "one letter over twice its share",
  "never-repeats": "the letter never repeats (a guessable pattern)",
  "stepping-pattern": "answers step A, B, C, D in order",
  "long-run": "one letter many times in a row",
};
const describe = (issue: string) => { const [k, rest] = issue.split(" ("); return `${ISSUE[k] ?? k}${rest ? ` (${rest}` : ""}`; };

/**
 * Admin: where the right answers sit in every question bank. Shows counts per letter and the banks with a pattern a student could exploit, never which
 * option is right. "Even out" moves options (the answer never changes; order-sensitive questions stay), after saving a copy of the bank to
 * mcq_answer_position_backups. The same rules as scripts/mcq/answer-positions.mjs.
 */
export default function AnswerPositionsAdmin() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    const all: Row[] = [];
    for (let from = 0; ; from += 100) {
      const { data, error } = await db.from("mcq_sets").select("id,title,category,source_type,published,updated_at,questions").is("deleted_at", null).order("id").range(from, from + 99);
      if (error) { toast({ title: "Could not load the banks", description: error.message, variant: "destructive" }); break; }
      all.push(...(data as Row[]));
      if ((data as Row[]).length < 100) break;
    }
    setRows(all);
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const audits = useMemo(() => (rows ?? []).map((r) => ({ r, a: auditBank(r.questions) as Audit })), [rows]);
  const totals = useMemo(() => {
    const counts = [0, 0, 0, 0, 0];
    let n = 0;
    for (const { a } of audits) for (const g of a.groups) { g.counts.forEach((c: number, p: number) => { if (p < 5) counts[p] += c; }); n += g.n; }
    return { counts, n, problem: audits.filter((x) => x.a.issues.length).length, review: audits.reduce((s, x) => s + x.a.flagged.length, 0) };
  }, [audits]);
  const problems = audits.filter((x) => x.a.issues.length);

  const evenOut = async (r: Row) => {
    setBusy(r.id);
    try {
      const plan = balanceBank(r.questions, { seed: r.id });
      if (!plan.moves.length) { toast({ title: "Nothing can be moved safely", description: "The questions here keep their order (they refer to letters or each other)." }); return; }
      const problemsFound = validateBankChange(r.questions, plan.questions);
      if (problemsFound.length) throw new Error(problemsFound.slice(0, 3).join("; "));
      const { error: bErr } = await db.from("mcq_answer_position_backups").insert({ kind: "mcq_set", item_id: r.id, before: r.questions, moves: plan.moves, source: "admin" });
      if (bErr) throw new Error(`backup failed: ${bErr.message}`);
      let q = db.from("mcq_sets").update({ questions: plan.questions }).eq("id", r.id);
      q = r.updated_at ? q.eq("updated_at", r.updated_at) : q.is("updated_at", null);
      const { data, error } = await q.select("id,questions");
      if (error) throw new Error(error.message);
      if (!data?.length) throw new Error("the bank changed since it was loaded; reload and try again");
      if (validateBankChange(r.questions, data[0].questions).length) throw new Error("the saved bank did not check out; restore it from the backup table");
      toast({ title: "Evened out", description: `${plan.moves.length} question(s) moved; ${plan.before.counts.join("/")} → ${plan.after.counts.join("/")}` });
      await load();
    } catch (e) {
      toast({ title: "Not changed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setBusy(null); }
  };

  if (!rows) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-bold text-foreground"><Scale className="h-4 w-4" /> Answer positions</h3>
            <p className="mt-1 text-sm text-muted-foreground">Where the right answers sit across {rows.length} banks ({totals.n} questions). About 25% each (20% with five options) is fair.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Reload</Button>
        </div>
        <div className="mt-4 grid grid-cols-5 gap-2 text-center">
          {totals.counts.map((c, p) => <div key={p} className="rounded-lg bg-muted/60 py-2"><p className="text-xs font-bold text-muted-foreground">{LETTERS[p]}</p><p className="text-lg font-bold tabular-nums">{pct(c, totals.n)}</p></div>)}
        </div>
        <p className="mt-3 text-sm"><strong>{totals.problem}</strong> bank(s) with a pattern · <strong>{totals.review}</strong> question(s) whose stored answer needs a person to check (listed by <code>node scripts/mcq/answer-positions.mjs report</code>)</p>
      </div>
      {problems.length === 0 ? <p className="text-sm text-muted-foreground">No bank has an answer-position pattern.</p> : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr><th className="p-2">Bank</th><th className="p-2">A/B/C/D/E</th><th className="p-2">Problem</th><th className="p-2" /></tr></thead>
            <tbody>
              {problems.map(({ r, a }) => (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="p-2"><p className="font-medium">{r.title}</p><p className="text-xs text-muted-foreground">{r.category} · {r.published ? "published" : "hidden"} · {a.total} questions{a.fixed ? ` · ${a.fixed} keep their order` : ""}</p></td>
                  <td className="p-2 tabular-nums">{a.counts.slice(0, 5).join("/")}</td>
                  <td className="p-2">{a.issues.map(describe).join("; ")}</td>
                  <td className="p-2 text-right"><Button size="sm" disabled={busy !== null} onClick={() => void evenOut(r)}>{busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Even out"}</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
