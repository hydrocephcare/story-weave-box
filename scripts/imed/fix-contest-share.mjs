// One-off: contest share links showed the homepage (or bounced to /contests). Causes found:
//  1. the briefing query asked for columns the contests table does not have (years, format, teams), so the lookup always failed;
//  2. a contest that is not found redirected to /contests instead of giving a contest card;
//  3. /contests/:slug/leaderboard and /register had no share rule at all, so they fell back to the homepage card.
import fs from "node:fs";
function edit(file, fn) {
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  const out = fn(raw.replace(/\r\n/g, "\n"));
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, "\r\n") : out);
}
const swap = (s, x, y) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 90)); return s.replace(x, y); };

edit("api/og-meta.ts", (s) => {
  if (s.includes("FALLBACK_CONTEST")) return s;
  // the right column names
  s = swap(s, "select=slug,title,subtitle,share_image_url,starts_at,ends_at,subjects,years,format,teams&slug=eq.", "select=slug,title,subtitle,share_image_url,starts_at,ends_at,subjects,eligible_years,competition_format&slug=eq.");
  s = swap(s, "Array.isArray(contest.years) ? contest.years.map((y: unknown) => `Year ${y}`).join(\", \") : \"\"", "Array.isArray(contest.eligible_years) ? contest.eligible_years.map((y: unknown) => `Year ${y}`).join(\", \") : \"\"");
  s = swap(s, "String(contest.format || \"\")", "String(contest.competition_format || \"\")");
  s = swap(s, "<p><strong>Representation:</strong> ${htmlEscape(String(contest.teams || \"\"))}</p>", "");
  // briefing, leaderboard and register all share the contest's own card
  s = swap(s, "} else if (section === \"contests\" && param && parts[2] === \"briefing\") {", "} else if (section === \"contests\" && param && [\"briefing\", \"leaderboard\", \"register\"].includes(parts[2])) {");
  s = swap(s, "      const contest = rows?.[0];\n      if (!contest) return permanentRedirect(\"/contests\");\n      title = `${contest.title} | Contest Briefing | OmpathStudy`;", "      const contest = rows?.[0] ?? FALLBACK_CONTEST(param);\n      title = `${contest.title} | ${parts[2] === \"leaderboard\" ? \"Leaderboard\" : parts[2] === \"register\" ? \"Register\" : \"Contest Briefing\"} | OmpathStudy`;");
  s = swap(s, "      const contest = rows?.[0];\n      if (!contest) return permanentRedirect(\"/contests\");\n      title = `${contest.title} | OmpathStudy`;", "      const contest = rows?.[0] ?? FALLBACK_CONTEST(param);\n      title = `${contest.title} | OmpathStudy`;");
  // the card shown when the contest is not in the database (yet)
  s = swap(s, "function permanentRedirect(path: string): Response {", "const FALLBACK_CONTEST = (slug: string) => ({ slug, title: \"Inter-University Medical Contest\", subtitle: \"Medical students from universities across Kenya compete on one board. Briefing, rules and dates are published here.\", share_image_url: null as string | null, starts_at: null as string | null, ends_at: null as string | null, subjects: [] as string[], eligible_years: [] as number[], competition_format: \"\" });\n\nfunction permanentRedirect(path: string): Response {");
  return s;
});

edit("vercel.json", (s) => {
  if (s.includes("/contests/:slug/leaderboard")) return s;
  const bot = '".*([Bb]ot|[Cc]rawl|[Ss]pider|facebookexternalhit|[Ww]hats[Aa]pp|[Tt]witter[Bb]ot|[Ss]lack[Bb]ot|[Tt]elegram[Bb]ot|[Dd]iscord[Bb]ot|[Ll]inked[Ii]n[Bb]ot).*"';
  const rule = (page) => `    {\n      "source": "/contests/:slug/${page}",\n      "has": [\n        {\n          "type": "header",\n          "key": "user-agent",\n          "value": ${bot}\n        }\n      ],\n      "destination": "/api/og-meta?path=/contests/:slug/${page}"\n    },\n`;
  const at = s.indexOf('    {\n      "source": "/contests/:slug/briefing",');
  if (at < 0) throw new Error("briefing rule not found");
  return s.slice(0, at) + rule("leaderboard") + rule("register") + s.slice(at);
});
console.log("contest share links fixed");
