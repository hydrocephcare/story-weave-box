// Loads the exported old OmpathStudy database (JSON files) into the new Supabase project.
// Run it yourself:  SUPABASE_ACCESS_TOKEN=<your token> node scripts/import-old-data.mjs <export-folder>
// Existing rows in the new project are kept (ON CONFLICT DO NOTHING); profiles are filled in from the old data.
// Safe to run again: finished rows are skipped. Prints counts only, never row contents.
import fs from "node:fs";

const REF = "strfwaqvxvkhjbqrwmla";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const DIR = process.argv[2];
if (!TOKEN || !DIR) { console.error("Usage: SUPABASE_ACCESS_TOKEN=... node scripts/import-old-data.mjs <export-folder>"); process.exit(1); }

const run = async (query) => {
  for (let i = 0; i < 6; i++) {
    try {
      const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
      const body = await r.json().catch(() => null);
      if (r.status >= 500 || r.status === 429) throw new Error(`HTTP ${r.status}`);
      if (!r.ok) return { error: body?.message || `HTTP ${r.status}` };
      return { rows: body };
    } catch (e) { await new Promise((s) => setTimeout(s, 2000 * 2 ** i)); }
  }
  return { error: "network gave up" };
};

// 1. Columns the old data needs that the new schema lacks (additive only)
const ddl = await run(`
create table if not exists public.note_image_runs(article_id uuid primary key, added integer not null default 0, tried_at timestamptz not null default now());
alter table public.note_image_runs enable row level security;
alter table public.notification_campaigns add column if not exists type text default 'general', add column if not exists priority text default 'normal', add column if not exists expires_at timestamptz, add column if not exists study_year integer;
alter table public.user_notifications add column if not exists type text default 'general', add column if not exists priority text default 'normal', add column if not exists study_year integer, add column if not exists expires_at timestamptz;
alter table public.stories add column if not exists submitted_by uuid default auth.uid();`);
if (ddl.error) { console.error("schema step failed:", ddl.error); process.exit(1); }

// 2. Which tables, in foreign-key order (auth accounts first)
const tables = fs.readdirSync(DIR).filter((f) => f.endsWith(".json") && !f.startsWith("_")).map((f) => f.slice(0, -5));
const fk = (await run(`select c.conrelid::regclass::text a, c.confrelid::regclass::text b from pg_constraint c where c.contype='f' and c.conrelid::regclass::text not like 'auth.%'`)).rows || [];
const dep = new Map(tables.map((t) => [t, new Set()]));
for (const { a, b } of fk) { const x = a.replace(/^public\./, ""), y = b.replace(/^public\./, ""); if (dep.has(x) && dep.has(y) && x !== y) dep.get(x).add(y); }
const order = []; const seen = new Set();
const visit = (t) => { if (seen.has(t)) return; seen.add(t); for (const d of dep.get(t)) visit(d); order.push(t); };
tables.forEach(visit);

// 3. Insert in batches of about 600 KB
const destCols = async (schema, table) => ((await run(`select column_name c from information_schema.columns where table_schema='${schema}' and table_name='${table}' and is_generated='NEVER' and (generation_expression is null)`)).rows || []).map((x) => x.c);
const load = async (schema, table, rows) => {
  const cols = await destCols(schema, table);
  const cleaned = rows;
  const list = cols.map((c) => `"${c}"`).join(",");
  let sent = 0, errors = 0, batch = [], size = 0;
  const flush = async () => {
    if (!batch.length) return;
    const json = JSON.stringify(batch).replace(/\$j\$/g, "");
    const tail = table === "profiles" ? `on conflict (id) do update set ${cols.filter((c) => c !== "id").map((c) => `"${c}" = excluded."${c}"`).join(",")}` : "on conflict do nothing";
    const r = await run(`insert into ${schema}."${table}" (${list}) select ${list} from jsonb_populate_recordset(null::${schema}."${table}", $j$${json}$j$::jsonb) ${tail}`);
    if (r.error) { errors++; console.log(`  ${schema}.${table}: batch failed (${r.error.slice(0, 120)})`); } else sent += batch.length;
    batch = []; size = 0;
  };
  for (const r of cleaned) { const s = JSON.stringify(r).length; if (size + s > 600000) await flush(); batch.push(r); size += s; }
  await flush();
  return { sent, errors };
};

const accounts = ["users", "identities"].filter((t) => fs.existsSync(`${DIR}/_auth_${t}.json`));
for (const t of accounts) { const rows = JSON.parse(fs.readFileSync(`${DIR}/_auth_${t}.json`, "utf8")); const r = await load("auth", t, rows); console.log(`auth.${t}: ${rows.length} exported, ${r.sent} sent, ${r.errors} failed batches`); }

const failed = [];
for (const pass of [1, 2, 3]) {
  const todo = pass === 1 ? order : failed.splice(0);
  for (const t of todo) {
    const rows = JSON.parse(fs.readFileSync(`${DIR}/${t}.json`, "utf8"));
    if (!rows.length) continue;
    const r = await load("public", t, rows);
    const n = (await run(`select count(*) n from public."${t}"`)).rows?.[0]?.n;
    console.log(`pass ${pass} ${t}: exported ${rows.length}, now in new project ${n}${r.errors ? " (some batches failed, will retry)" : ""}`);
    if (r.errors) failed.push(t);
  }
  if (!failed.length) break;
}

// 4. Sequences follow the data
await run(`do $$ declare r record; begin for r in select s.relname seq, t.relname tbl, a.attname col, n.nspname sch from pg_class s join pg_depend d on d.objid=s.oid join pg_class t on t.oid=d.refobjid join pg_attribute a on a.attrelid=t.oid and a.attnum=d.refobjsubid join pg_namespace n on n.oid=t.relnamespace where s.relkind='S' and n.nspname='public' loop execute format('select setval(%L, coalesce((select max(%I) from %I.%I),1))', 'public.'||r.seq, r.col, r.sch, r.tbl); end loop; end $$;`);
console.log(failed.length ? `Still failing: ${failed.join(", ")}` : "Done. Every table loaded.");
