// Answer-position report and fix for the stored MCQs: the question banks (mcq_sets) and, with --articles, the questions written inside posts
// (articles in the "Question N / A. … / Answer: B" format). The right answer is never changed: options are only moved, with the rules in
// supabase/functions/_shared/mcqPositions.js (order-sensitive and doubtful questions are left alone, and a fair bank is not touched). The report
// shows counts per letter and never prints question text or which option is right, so it is safe to share with staff.
//
//   node scripts/mcq/answer-positions.mjs report                 every bank, per year / subject / source, and the banks with a problem
//   node scripts/mcq/answer-positions.mjs plan                   what a fix would change (nothing is written)
//   node scripts/mcq/answer-positions.mjs apply --limit 5        fix the first 5 problem banks (a sample), then
//   node scripts/mcq/answer-positions.mjs apply --all            fix every problem bank
//   node scripts/mcq/answer-positions.mjs restore --id <id>      put one bank (or, with --articles, one post) back from its latest backup
//
// Options: --articles (posts instead of banks), --from-file <rows.json> (an export of the rows; report/plan only), --published (published only),
// --out <dir> (report files, default reports/), --id <id> (one bank or post).
// Reading unpublished rows and writing needs the service key for one run, never committed:
//   PowerShell: $env:SUPABASE_SERVICE_ROLE_KEY="<key>"; node scripts/mcq/answer-positions.mjs apply --limit 5
// Every write first stores the previous version in mcq_answer_position_backups (migration 20261028140000) and in a local JSON file, then updates the
// row only if nobody changed it in the meantime, then reads it back and checks it.
import fs from "node:fs";
import path from "node:path";
import { auditBank, balanceBank, validateBankChange, LETTERS } from "../../supabase/functions/_shared/mcqPositions.js";
import { auditArticle, balanceArticleLetters, readArticleQuestions } from "../../supabase/functions/_shared/markdownMcqs.js";

const args = process.argv.slice(2);
const mode = args[0] || "report";
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const flag = (name) => args.includes(`--${name}`);
const ARTICLES = flag("articles");
const OUT = opt("out") || "reports";
const FROM = opt("from-file");
const ONLY = opt("id") || opt("set");
const LIMIT = flag("all") ? Infinity : Number(opt("limit") || 0);

// the two kinds of stored questions, behind one interface
const KIND = ARTICLES
  ? {
    name: "article", table: "articles", cols: "id,title,category,published,updated_at,content", label: "posts",
    keep: (r) => readArticleQuestions(r.content).blocks.length > 0,
    audit: (r) => auditArticle(r.content),
    plan: (r) => { const p = balanceArticleLetters(r.id, r.content, { force: false }); return { value: p.content, moves: Array.from({ length: p.changed }), before: p.before, after: p.after }; },
    check: (r, value) => {
      const a = readArticleQuestions(r.content).blocks.map((b) => b.q), b = readArticleQuestions(value).blocks.map((x) => x.q);
      if (a.length !== b.length) return ["question count changed"];
      return a.flatMap((q, i) => (q.options[q.correct_answer] === b[i].options[b[i].correct_answer] && q.question === b[i].question ? [] : [`#${i + 1}: answer changed`]));
    },
    field: "content", before: (r) => r.content,
  }
  : {
    name: "mcq_set", table: "mcq_sets", cols: "id,title,slug,category,source_type,published,exam_year,updated_at,questions", label: "banks",
    keep: () => true,
    audit: (r) => auditBank(r.questions),
    plan: (r) => { const p = balanceBank(r.questions, { seed: r.id }); return { value: p.questions, moves: p.moves, before: p.before, after: p.after }; },
    check: (r, value) => validateBankChange(r.questions, value),
    field: "questions", before: (r) => r.questions,
  };

async function client() {
  const { sb, usingServiceKey } = await import("../maintenance/db.mjs");
  return { sb, usingServiceKey };
}

async function loadRows() {
  if (FROM) {
    const rows = JSON.parse(fs.readFileSync(FROM, "utf8"));
    return rows.filter((r) => !r.deleted_at && (!ONLY || r.id === ONLY) && (!flag("published") || r.published) && KIND.keep(r));
  }
  const { sb, usingServiceKey } = await client();
  if (!usingServiceKey) console.warn("No SUPABASE_SERVICE_ROLE_KEY: only published rows are visible.");
  const rows = [];
  for (let from = 0; ; from += 100) {
    let q = sb.from(KIND.table).select(KIND.cols).is("deleted_at", null).order("id").range(from, from + 99);
    if (ONLY) q = q.eq("id", ONLY);
    if (flag("published")) q = q.eq("published", true);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < 100) break;
  }
  return rows.filter(KIND.keep);
}

const yearOf = (r) => { const m = String(r.category || "").match(/^Year\s*(\d)/i); return m ? `Year ${m[1]}` : "No year"; };
const subjectOf = (r) => String(r.category || "Uncategorised").replace(/^Year\s*\d\s*:\s*/i, "").trim() || "Uncategorised";
const sourceOf = (r) => (ARTICLES ? "post" : r.source_type || "uploaded/imported");
const pct = (c, n) => (n ? `${Math.round((c / n) * 1000) / 10}%` : "-");

// counts per letter A..E; the very few questions with more than five options are counted under "F+"
function summarise(audits) {
  const counts = [0, 0, 0, 0, 0, 0];
  const byK = {};
  let total = 0;
  for (const a of audits) for (const g of a.groups) {
    byK[g.k] ??= Array(g.k).fill(0);
    g.counts.forEach((c, p) => { byK[g.k][p] += c; counts[Math.min(p, 5)] += c; });
    total += g.n;
  }
  return { banks: audits.length, total, counts, byK, problemBanks: audits.filter((a) => a.issues.length).length, flaggedQuestions: audits.reduce((s, a) => s + a.flagged.length, 0), lockedQuestions: audits.reduce((s, a) => s + a.fixed, 0), staleAnswerText: audits.reduce((s, a) => s + (a.staleText || 0), 0) };
}

const line = (label, s) => `${label.padEnd(44)} ${String(s.banks).padStart(5)} ${KIND.label.padEnd(5)} ${String(s.total).padStart(6)} q  ${s.counts.map((c, p) => `${p < 5 ? LETTERS[p] : "F+"} ${pct(c, s.total).padStart(6)}`).join("  ")}  with a problem ${s.problemBanks}`;

function groupBy(rows, audits, key) {
  const m = new Map();
  rows.forEach((r, i) => { const k = key(r); if (!m.has(k)) m.set(k, []); m.get(k).push(audits[i]); });
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, list]) => [k, summarise(list)]);
}

function writeReports(rows, before, after, plans) {
  fs.mkdirSync(OUT, { recursive: true });
  const stamp = `${KIND.name}-${new Date().toISOString().slice(0, 10)}`;
  const perBank = rows.map((r, i) => ({
    id: r.id, title: r.title, category: r.category, year: yearOf(r), subject: subjectOf(r), source: sourceOf(r), published: !!r.published,
    questions: before[i].total, counts: before[i].counts, issues: before[i].issues, locked: before[i].fixed, stale_answer_text: before[i].staleText || 0,
    flagged_for_review: before[i].flagged.length, planned_moves: plans?.[i]?.moves.length ?? 0, counts_after: after?.[i]?.counts, issues_after: after?.[i]?.issues,
  }));
  const summary = {
    generated_at: new Date().toISOString(), kind: KIND.name, source: FROM ? `file ${path.basename(FROM)}` : "live database",
    before: summarise(before), after: after ? summarise(after) : undefined,
    by_source: Object.fromEntries(groupBy(rows, before, sourceOf)), by_year: Object.fromEntries(groupBy(rows, before, yearOf)),
    by_subject: Object.fromEntries(groupBy(rows, before, subjectOf)),
    ...(after ? { by_source_after: Object.fromEntries(groupBy(rows, after, sourceOf)), by_year_after: Object.fromEntries(groupBy(rows, after, yearOf)) } : {}),
  };
  fs.writeFileSync(path.join(OUT, `answer-positions-${stamp}.json`), JSON.stringify({ summary, banks: perBank }, null, 1));
  const csv = ["id,title,year,subject,source,published,questions,A,B,C,D,E,issues,locked,flagged_for_review,planned_moves,A_after,B_after,C_after,D_after,E_after,issues_after"]
    .concat(perBank.map((b) => [b.id, JSON.stringify(b.title || ""), b.year, JSON.stringify(b.subject), b.source, b.published, b.questions, ...[0, 1, 2, 3, 4].map((p) => b.counts[p] ?? 0), JSON.stringify(b.issues.join(" ")), b.locked, b.flagged_for_review, b.planned_moves, ...[0, 1, 2, 3, 4].map((p) => b.counts_after?.[p] ?? ""), JSON.stringify((b.issues_after || []).join(" "))].join(",")));
  fs.writeFileSync(path.join(OUT, `answer-positions-${stamp}.csv`), csv.join("\n"));
  // the questions a person should check: where they are and why, never what the answer is
  const review = rows.flatMap((r, i) => before[i].flagged.map((f) => ({ id: r.id, title: r.title, question_number: f.index + 1, reason: f.reason })));
  fs.writeFileSync(path.join(OUT, `needs-review-${stamp}.csv`), ["id,title,question_number,reason", ...review.map((x) => [x.id, JSON.stringify(x.title || ""), x.question_number, x.reason].join(","))].join("\n"));
  return { summary, review };
}

function printSummary(rows, before, after) {
  console.log(line(`ALL ${KIND.label.toUpperCase()} (before)`, summarise(before)));
  if (after) console.log(line(`ALL ${KIND.label.toUpperCase()} (after the planned fix)`, summarise(after)));
  for (const [title, key] of [["By source", sourceOf], ["By year", yearOf]]) {
    console.log(`\n${title}`);
    for (const [k, s] of groupBy(rows, before, key)) console.log(line(`  ${k}`, s));
    if (after) for (const [k, s] of groupBy(rows, after, key)) console.log(line(`  ${k} (after)`, s));
  }
  console.log(`\n${KIND.label} with a problem (counts A..E, issues):`);
  rows.forEach((r, i) => { if (before[i].issues.length) console.log(`  ${String(r.title || r.id).slice(0, 60).padEnd(60)} ${before[i].counts.slice(0, 5).join("/").padEnd(14)} ${before[i].issues.join(", ")}${after ? `  ->  ${after[i].counts.slice(0, 5).join("/")} ${after[i].issues.join(", ") || "ok"}` : ""}`); });
}

if (mode === "restore") {
  if (!ONLY) { console.error("restore needs --id <id>."); process.exit(1); }
  const { sb } = await client();
  const { data, error } = await sb.from("mcq_answer_position_backups").select("id,before,created_at").eq("kind", KIND.name).eq("item_id", ONLY).order("created_at", { ascending: false }).limit(1);
  if (error || !data?.length) { console.error(error?.message || "No backup for that id."); process.exit(1); }
  const { error: uErr } = await sb.from(KIND.table).update({ [KIND.field]: data[0].before }).eq("id", ONLY);
  console.log(uErr ? `Restore failed: ${uErr.message}` : `Restored ${ONLY} from the backup of ${data[0].created_at}.`);
  process.exit(uErr ? 1 : 0);
}

const rows = await loadRows();
const before = rows.map(KIND.audit);
const plans = rows.map(KIND.plan);
const after = plans.map((p) => p.after);
const bad = plans.map((p, i) => (p.moves.length ? KIND.check(rows[i], p.value) : [])).map((v, i) => (v.length ? [rows[i].id, v] : null)).filter(Boolean);
if (bad.length) { console.error("Validation failed, nothing written:", JSON.stringify(bad.slice(0, 5), null, 1)); process.exit(1); }

if (mode === "report" || mode === "plan") {
  printSummary(rows, before, mode === "plan" ? after : null);
  const { review } = writeReports(rows, before, mode === "plan" ? after : null, mode === "plan" ? plans : null);
  const moves = plans.reduce((s, p) => s + p.moves.length, 0);
  console.log(`\n${rows.length} ${KIND.label}, ${before.reduce((s, a) => s + a.total, 0)} questions audited. ${plans.filter((p) => p.moves.length).length} ${KIND.label} / ${moves} questions would be moved. ${review.length} questions flagged for review. Files in ${OUT}/.`);
  process.exit(0);
}

if (mode === "apply") {
  if (FROM) { console.error("apply works on the live database only (drop --from-file)."); process.exit(1); }
  if (!LIMIT) { console.error("Say how many: --limit 5 for a sample, or --all."); process.exit(1); }
  const { sb, usingServiceKey } = await client();
  if (!usingServiceKey) { console.error("apply needs SUPABASE_SERVICE_ROLE_KEY for this run."); process.exit(1); }
  const todo = rows.map((r, i) => ({ r, p: plans[i] })).filter((x) => x.p.moves.length).slice(0, LIMIT);
  fs.mkdirSync(path.join(OUT, "backups"), { recursive: true });
  const local = path.join(OUT, "backups", `answer-positions-${KIND.name}-${Date.now()}.json`);
  fs.writeFileSync(local, JSON.stringify(todo.map(({ r }) => ({ id: r.id, updated_at: r.updated_at, before: KIND.before(r) }))));
  console.log(`Local backup of ${todo.length} ${KIND.label}: ${local}`);
  let done = 0;
  for (const { r, p } of todo) {
    const { error: bErr } = await sb.from("mcq_answer_position_backups").insert({ kind: KIND.name, item_id: r.id, before: KIND.before(r), moves: ARTICLES ? [] : p.moves, source: "script" });
    if (bErr) { console.error(`Backup failed for ${r.id} (${bErr.message}); stopping. Is migration 20261028140000 applied?`); process.exit(1); }
    let upd = sb.from(KIND.table).update({ [KIND.field]: p.value }).eq("id", r.id);
    upd = r.updated_at ? upd.eq("updated_at", r.updated_at) : upd.is("updated_at", null);
    const { data, error } = await upd.select(`id,${KIND.field}`);
    if (error || !data?.length) { console.warn(`Skipped ${r.title}: ${error?.message || "changed since it was read"}`); continue; }
    // read back: the stored version must be exactly the planned one, with every answer unchanged and no pattern left
    const stored = data[0][KIND.field];
    const v = KIND.check(r, stored);
    const ok = !v.length && JSON.stringify(stored) === JSON.stringify(p.value) && !KIND.audit({ ...r, [KIND.field]: stored }).issues.length;
    console.log(`${ok ? "fixed" : "CHECK"}  ${String(r.title).slice(0, 60).padEnd(60)} ${p.before.counts.slice(0, 5).join("/")} -> ${p.after.counts.slice(0, 5).join("/")} (${p.moves.length} moved)${ok ? "" : ` ${v.join("; ") || "a pattern remains (locked questions)"}`}`);
    done++;
  }
  console.log(`${done} of ${todo.length} ${KIND.label} updated.`);
  process.exit(0);
}

console.error(`Unknown mode "${mode}". Use report, plan, apply or restore.`);
process.exit(1);
