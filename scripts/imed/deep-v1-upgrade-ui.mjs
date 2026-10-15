// One-off: a page that still has the first version of the deep notes shows an "Upgrade" bar to Pro readers, and the admin list marks it.
import fs from "node:fs";
function edit(file, fn) {
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  const out = fn(raw.replace(/\r\n/g, "\n"));
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, "\r\n") : out);
}
const swap = (s, x, y) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 80)); return s.replace(x, y); };

edit("src/pages/TopicPage.tsx", (s) => {
  if (s.includes("first version")) return s;
  return swap(s, "      {canRead && drill && <DrillMode", [
    "      {canRead && !deep.vivas?.length && (",
    "        <div className=\"no-print mb-8 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-5 py-4\">",
    "          <p className=\"min-w-0 flex-1 text-[16px] font-semibold\">These are the first version of the deep notes. The full version adds numbers to memorise, 15+ viva questions with answers, MCQs and cases.</p>",
    "          <button type=\"button\" onClick={() => void write()} disabled={busy} className=\"inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60\">{busy ? <Loader2 className=\"h-4 w-4 animate-spin\" aria-hidden /> : <Sparkles className=\"h-4 w-4\" aria-hidden />} {busy ? \"Writing, about 15 seconds...\" : \"Write the full version\"}</button>",
    "          {err && <p role=\"alert\" className=\"w-full text-sm font-semibold text-red-600\">{err}</p>}",
    "        </div>",
    "      )}",
    "      {canRead && drill && <DrillMode",
  ].join("\n"));
});

edit("src/pages/AdminThinTopics.tsx", (s) => {
  if (s.includes("v2")) return s;
  s = swap(s, "interface Row { slug: string; name: string; category: string | null; deepAt: string | null; down: number; up: number }", "interface Row { slug: string; name: string; category: string | null; deepAt: string | null; v2: boolean; down: number; up: number }");
  s = swap(s, "deepAt:content->deep->>generatedAt,hasDeep:content->deep->>model\")", "deepAt:content->deep->>generatedAt,hasDeep:content->deep->>model,v2:content->deep->facts\")");
  s = swap(s, "(Omit<Row, \"up\" | \"down\"> & { hasDeep: string | null })[]).map((r) => ({ ...r, deepAt: r.deepAt ?? r.hasDeep,", "(Omit<Row, \"up\" | \"down\" | \"v2\"> & { hasDeep: string | null; v2: unknown })[]).map((r) => ({ ...r, deepAt: r.deepAt ?? r.hasDeep, v2: Boolean(r.v2),");
  s = swap(s, "Number(Boolean(a.deepAt)) - Number(Boolean(b.deepAt))", "Number(a.v2) - Number(b.v2)");
  s = swap(s, "x.slug === r.slug ? { ...x, deepAt: \"now\" } : x", "x.slug === r.slug ? { ...x, deepAt: \"now\", v2: true } : x");
  s = swap(s, "const without = rows.filter((r) => !r.deepAt).length;", "const without = rows.filter((r) => !r.v2).length;");
  s = swap(s, "{r.deepAt ? \"Deep notes ready\" : \"No deep notes yet\"}", "{r.v2 ? \"Full deep notes ready\" : r.deepAt ? \"First version only\" : \"No deep notes yet\"}");
  s = swap(s, "{!r.deepAt && <button", "{!r.v2 && <button");
  s = swap(s, ">Write deep notes</button>", ">{r.deepAt ? \"Write the full version\" : \"Write deep notes\"}</button>");
  return s;
});
console.log("upgrade bar added");
