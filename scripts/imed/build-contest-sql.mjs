// Builds ONE SQL file that installs the whole contest platform (and the notification tables it needs) on a database where the contest migrations were never applied.
// It is safe to run twice: policies, constraints and triggers are dropped before they are created. The demo-contest seed is left out (it stops with an error when its sample
// paper is missing); a few sample universities are added at the end.
//   node scripts/imed/build-contest-sql.mjs
import fs from "node:fs";
const DIR = "supabase/migrations";
const OUTNAME = "20261016100000_contest_platform_bundle.sql";
const files = fs.readdirSync(DIR).sort().filter((f) => (/contest/i.test(f) || f === "20260830050000_notification_campaigns.sql") && !/seed_hematology/.test(f) && f !== OUTNAME);

const esc = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const GUARDED_CRON = [
  "do $$",
  "begin",
  "  begin create extension if not exists pg_cron; exception when others then raise notice 'pg_cron is not available: contest reminders will not be scheduled'; end;",
  "  if exists (select 1 from pg_extension where extname = 'pg_cron') then",
  "    perform cron.unschedule(jobid) from cron.job where jobname = 'sync-contest-schedule';",
  "    perform cron.schedule('sync-contest-schedule', '* * * * *', 'select private.sync_contest_schedule();');",
  "    perform cron.unschedule(jobid) from cron.job where jobname = 'queue-contest-reminders';",
  "    perform cron.schedule('queue-contest-reminders', '* * * * *', 'select private.queue_contest_reminders();');",
  "  end if;",
  "end $$;",
].join("\n");

const fix = (sql) => {
  // a policy / constraint / trigger is dropped first, so running the file again does not fail
  sql = sql.replace(/(^|\n)(\s*)create policy\s+("[^"]+"|\w+)\s+on\s+([\w."]+)/gi, (m, nl, ind, name, target, off, all) => {
    const before = all.slice(Math.max(0, off - 160), off);
    return new RegExp(`drop policy if exists\\s+${esc(name)}\\s+on\\s+${esc(target)}\\s*;\\s*$`, "i").test(before)
      ? m : `${nl}${ind}drop policy if exists ${name} on ${target};\n${ind}create policy ${name} on ${target}`;
  });
  sql = sql.replace(/(^|\n)(\s*)alter table\s+([\w.]+)\s+add constraint\s+(\w+)/gi, (m, nl, ind, t, c) => `${nl}${ind}alter table ${t} drop constraint if exists ${c};\n${ind}alter table ${t} add constraint ${c}`);
  sql = sql.replace(/(^|\n)(\s*)create trigger\s+(\w+)([\s\S]*?)\son\s+([\w.]+)/gi, (m, nl, ind, name, mid, target) => `${nl}${ind}drop trigger if exists ${name} on ${target};\n${ind}create trigger ${name}${mid} on ${target}`);
  // the reminder schedule needs pg_cron; if the database does not have it, the rest still installs
  sql = sql.replace(/do \$\$\s*begin\s*perform cron\.unschedule[\s\S]*?end \$\$;/, () => GUARDED_CRON);
  return sql;
};

const sample = `
-- Sample universities so the registration form has something to choose from (an admin can edit or remove them in Admin > Contests).
insert into public.contest_universities (name, slug, abbreviation, active, verified)
select v.name, v.slug, v.abbr, true, true from (values ('University of Nairobi', 'university-of-nairobi', 'UoN'), ('Kenyatta University', 'kenyatta-university', 'KU'), ('Mount Kenya University', 'mount-kenya-university', 'MKU')) as v(name, slug, abbr)
where not exists (select 1 from public.contest_universities u where u.slug = v.slug);
`;

let out = `-- ONE FILE: installs the contest platform and the notification tables it uses. Safe to run twice.\n-- Built by scripts/imed/build-contest-sql.mjs from ${files.length} migrations.\n\n`;
for (const f of files) out += `-- ===== ${f} =====\n${fix(fs.readFileSync(`${DIR}/${f}`, "utf8").replace(/\r\n/g, "\n"))}\n\n`;
fs.writeFileSync(`${DIR}/${OUTNAME}`, out + sample);
console.log(`${files.length} migrations bundled into ${DIR}/${OUTNAME} (${Math.round(out.length / 1024)} KB)`);
