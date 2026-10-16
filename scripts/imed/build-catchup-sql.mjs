// Builds ONE idempotent SQL file with every migration from a given version on, for a project that stopped receiving migrations (e.g. after moving projects).
//   node scripts/imed/build-catchup-sql.mjs [firstVersion] [outFile]
// Policies, constraints and triggers are dropped before they are created, so the file can be run twice; the pg_cron blocks are guarded.
import fs from "node:fs";
const DIR = "supabase/migrations";
const FIRST = process.argv[2] || "20260923095000";
const OUT = process.argv[3] || "catchup.sql";
const files = fs.readdirSync(DIR).sort().filter((f) => f >= FIRST && !/seed_hematology/.test(f) && !/_contest_platform_bundle\.sql$/.test(f) && !/_contest_kenyan_universities\.sql$/.test(f));

const esc = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const GUARD = (name, expr) => ["do $$", "begin", "  begin create extension if not exists pg_cron; exception when others then raise notice 'pg_cron is not available'; end;", "  if exists (select 1 from pg_extension where extname = 'pg_cron') then", `    ${expr}`, "  end if;", "end $$;"].join("\n");

const fix = (sql) => {
  sql = sql.replace(/(^|\n)(\s*)create policy\s+("[^"]+"|\w+)\s+on\s+([\w."]+)/gi, (m, nl, ind, name, target, off, all) => {
    const before = all.slice(Math.max(0, off - 200), off);
    return new RegExp(`drop policy if exists\\s+${esc(name)}\\s+on\\s+${esc(target)}\\s*;\\s*$`, "i").test(before) ? m : `${nl}${ind}drop policy if exists ${name} on ${target};\n${ind}create policy ${name} on ${target}`;
  });
  sql = sql.replace(/(^|\n)(\s*)alter table\s+([\w.]+)\s+add constraint\s+(\w+)/gi, (m, nl, ind, t, c) => `${nl}${ind}alter table ${t} drop constraint if exists ${c};\n${ind}alter table ${t} add constraint ${c}`);
  sql = sql.replace(/(^|\n)(\s*)create trigger\s+(\w+)([\s\S]*?)\son\s+([\w.]+)/gi, (m, nl, ind, name, mid, target) => `${nl}${ind}drop trigger if exists ${name} on ${target};\n${ind}create trigger ${name}${mid} on ${target}`);
  // any block that unschedules/schedules a pg_cron job must not fail where pg_cron is missing
  sql = sql.replace(/do \$\$\s*begin\s*perform cron\.unschedule[\s\S]*?end \$\$;/g, (block) => {
    const inner = block.replace(/^do \$\$\s*begin\s*/i, "").replace(/\s*end \$\$;$/i, "");
    return GUARD("cron", inner);
  });
  return sql;
};

let out = `-- CATCH-UP SQL: ${files.length} migrations (${files[0]?.slice(0, 14)} to ${files.at(-1)?.slice(0, 14)}). Safe to run twice. Run it once in the Supabase SQL editor of the project that is missing them.\n\n`;
for (const f of files) out += `-- ===== ${f} =====\n${fix(fs.readFileSync(`${DIR}/${f}`, "utf8").replace(/\r\n/g, "\n"))}\n\n`;
fs.writeFileSync(OUT, out);
console.log(`${files.length} migrations -> ${OUT} (${Math.round(out.length / 1024)} KB)`);
