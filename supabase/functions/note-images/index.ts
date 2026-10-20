// Puts relevant pictures into a published study note: for the main sections it looks on Wikimedia Commons (free licences only), keeps a picture only if
// its title and description name the section's subject, asks the AI to confirm from the descriptions, and inserts it under the section with its credit.
// Called by the schedule (x-cron-key, picks the newest note without pictures) or by an administrator (body.article_id).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { chatText } from "../_shared/aiChat.js";
import { cleanTopicTitle } from "../_shared/topicTitle.js";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

const STOP = new Set("the and for with from that this into than then what when which about after before between during notes note normal disorders disorder overview introduction summary approach management features causes types principles evaluation assessment".split(" "));
const BAD = /logo|flag|signature|portrait|map of|icon|symbol|stamp|banner|poster|conference|ceremony|building|campus|army|military|stub|commons-|wikidata/i;
const words = (t: string) => [...new Set(t.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w)))];
const strip = (h: string) => String(h || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#0?39;|&quot;/g, "'").replace(/\s+/g, " ").trim();
const FREE = /^(cc[- ]|public domain|pd[- ]|attribution|cc0|gfdl)/i;

interface Pic { url: string; title: string; about: string; credit: string; licence: string; w: number }

async function commons(query: string): Promise<Pic[]> {
  const p = new URLSearchParams({ action: "query", format: "json", generator: "search", gsrnamespace: "6", gsrlimit: "14", gsrsearch: `${query} filetype:bitmap|drawing`, prop: "imageinfo", iiprop: "url|extmetadata|mime|size", iiurlwidth: "900", iiextmetadatafilter: "ImageDescription|Artist|LicenseShortName|ObjectName" });
  const r = await fetch(`https://commons.wikimedia.org/w/api.php?${p}`, { headers: { "User-Agent": "OmpathStudy/1.0 (https://www.ompathstudy.com)" } });
  if (!r.ok) return [];
  const pages = Object.values(((await r.json())?.query?.pages ?? {}) as Record<string, any>);
  const out: Pic[] = [];
  for (const pg of pages) {
    const info = pg.imageinfo?.[0]; if (!info) continue;
    const m = info.extmetadata ?? {};
    const lic = strip(m.LicenseShortName?.value);
    const url: string = info.thumburl || info.url || "";
    if (!/^https:\/\/upload\.wikimedia\.org\//.test(url) || /[()\s\]]/.test(url)) continue;
    if (!FREE.test(lic) || !/^image\/(jpeg|png|svg)/.test(info.mime || "") || (info.width || 0) < 400) continue;
    const title = String(pg.title || "").replace(/^File:/, "").replace(/\.[a-z]+$/i, "").replace(/_/g, " ");
    const about = strip(m.ImageDescription?.value).slice(0, 220);
    if (BAD.test(`${title} ${about}`)) continue;
    out.push({ url, title, about, credit: strip(m.Artist?.value).slice(0, 50) || "Wikimedia Commons", licence: lic, w: info.width || 0 });
  }
  return out;
}

/** The lead picture of the Wikipedia article that is exactly about the subject, only when it is a free picture held on Commons. */
async function wikiLead(subject: string, keys: string[]): Promise<{ url: string; title: string; caption: string } | null> {
  const q = subject.replace(/[^A-Za-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (!q) return null;
  const p = new URLSearchParams({ action: "query", format: "json", generator: "search", gsrsearch: q, gsrlimit: "4", prop: "pageimages|pageterms", piprop: "thumbnail", pithumbsize: "900", wbptterms: "description" });
  const r = await fetch(`https://en.wikipedia.org/w/api.php?${p}`, { headers: { "User-Agent": "OmpathStudy/1.0 (https://www.ompathstudy.com)" } });
  if (!r.ok) return null;
  const pages = Object.values(((await r.json())?.query?.pages ?? {}) as Record<string, any>).sort((a: any, b: any) => (a.index ?? 9) - (b.index ?? 9));
  for (const pg of pages) {
    const title = String(pg.title || "");
    const url: string = String(pg.thumbnail?.source || "").replace("https://thumb.wikimedia.org", "https://upload.wikimedia.org").split("?")[0];
    if (!url || !/\/wikipedia\/commons\//.test(url) || /[()\s\]]/.test(url) || BAD.test(url)) continue;
    const t = title.toLowerCase();
    if (!keys.length || !keys.every((k) => t.includes(k))) continue;
    const desc = String(pg.terms?.description?.[0] || "");
    if (!/disease|disorder|syndrome|condition|medical|anatom|organ|bone|muscle|artery|vein|nerve|gland|cell|tissue|infection|cancer|tumou?r|drug|medication|procedure|test|symptom|sign|hormone|virus|bacteri|parasite|vitamin|protein|enzyme|growth|development/i.test(desc)) continue;
    return { url, title, caption: `${title} · Image from the Wikipedia article, Wikimedia Commons`.replace(/[\[\]()\n]/g, " ") };
  }
  return null;
}

const MEDICAL = /disease|disorder|syndrome|condition|medical|medicine|anatom|organ|bone|muscle|artery|vein|nerve|gland|cell|tissue|infect|cancer|tumou?r|drug|medication|procedure|test|symptom|sign|hormone|virus|bacteri|parasite|vitamin|protein|enzyme|growth|development|brain|heart|lung|kidney|liver|skin|blood|newborn|infant|child|body|surgery|therapy|deficien|fracture|injury|ulcer|inflammation|paralysis|palsy|autism|chart|scale|reflex|milestone/i;

/** Wikipedia articles whose title is exactly one of the terms (redirects followed): the lead picture of an article about exactly that subject, free licence only. */
async function wikiExact(terms: string[]): Promise<Map<string, { url: string; title: string }>> {
  const out = new Map<string, { url: string; title: string }>();
  for (let i = 0; i < terms.length; i += 40) {
    const chunk = terms.slice(i, i + 40);
    const p = new URLSearchParams({ action: "query", format: "json", redirects: "1", titles: chunk.join("|"), prop: "pageimages|pageterms", piprop: "thumbnail", pithumbsize: "900", wbptterms: "description" });
    const r = await fetch(`https://en.wikipedia.org/w/api.php?${p}`, { headers: { "User-Agent": "OmpathStudy/1.0 (https://www.ompathstudy.com)" } });
    if (!r.ok) continue;
    const q = (await r.json())?.query ?? {};
    const alias = new Map<string, string>();
    for (const n of q.normalized ?? []) alias.set(n.from, n.to);
    for (const n of q.redirects ?? []) alias.set(n.from, n.to);
    const byTitle = new Map<string, any>(Object.values(q.pages ?? {}).map((pg: any) => [pg.title, pg]));
    for (const t of chunk) {
      let to = t; for (let k = 0; k < 3 && alias.has(to); k++) to = alias.get(to)!;
      const pg = byTitle.get(to);
      const url: string = String(pg?.thumbnail?.source || "").replace("https://thumb.wikimedia.org", "https://upload.wikimedia.org").split("?")[0];
      if (!pg || !url || !/\/wikipedia\/commons\//.test(url) || /[()\s\]]/.test(url) || BAD.test(url)) continue;
      if (!MEDICAL.test(String(pg.terms?.description?.[0] || ""))) continue;
      out.set(t, { url, title: pg.title });
    }
  }
  return out;
}

/** The first paragraph after a heading ends at the next blank line; the picture goes right after it. */
function insertAfterFirstPara(lines: string[], headingIdx: number, imgLine: string): boolean {
  let i = headingIdx + 1;
  while (i < lines.length && !lines[i].trim()) i++;
  if (i >= lines.length || /^(#{1,6}\s|[-*]\s|\d+\.\s|\||!\[)/.test(lines[i].trim())) return false;
  while (i < lines.length && lines[i].trim()) i++;
  lines.splice(i, 0, "", imgLine);
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const cronOk = !!Deno.env.get("CRON_KEY") && req.headers.get("x-cron-key") === Deno.env.get("CRON_KEY");
    const body = await req.json().catch(() => ({}));
    if (!cronOk) {
      const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: u } = token ? await supabase.auth.getUser(token) : { data: null };
      const { data: ok } = u?.user ? await supabase.rpc("has_role", { _user_id: u.user.id, _role: "admin" }) : { data: false };
      if (!ok) return json({ error: "Administrators only." }, 403);
    }
    let a: { id: string; title: string; category: string; content: string } | null = null;
    if (body?.article_id) {
      const { data } = await supabase.from("articles").select("id,title,category,content").eq("id", body.article_id).maybeSingle(); a = data;
    } else {
      // a note is left alone once it was done; one whose check could not run (the AI was busy, added = -1) is tried again after three hours
      const { data: tried } = await supabase.from("note_image_runs").select("article_id,added,tried_at");
      const skip = new Set((tried ?? []).filter((t: { added: number; tried_at: string }) => t.added >= 0 || Date.now() - new Date(t.tried_at).getTime() < 3 * 3600_000).map((t: { article_id: string }) => t.article_id));
      const { data: rows } = await supabase.from("articles").select("id,title,category,content").eq("published", true).is("deleted_at", null)
        .not("content", "like", "%upload.wikimedia.org%").not("title", "ilike", "%mcq%").not("title", "ilike", "%question%").not("title", "ilike", "%exam%").not("title", "ilike", "%paper%").not("title", "ilike", "%quiz%")
        .order("created_at", { ascending: false }).limit(60);
      // newest first; one of the first few at random, so several runs in the same minute do not take the same note
      const todo = (rows ?? []).filter((r: { id: string; content: string }) => !skip.has(r.id) && String(r.content).length > 3000 && (String(r.content).match(/^#{2,3}\s/gm) || []).length >= 4);
      a = todo.length ? todo[Math.floor(Math.random() * Math.min(5, todo.length))] : null;
    }
    if (!a) return json({ success: true, done: true });

    const lines = String(a.content).replace(/\r\n/g, "\n").split("\n");
    const head = cleanTopicTitle(a.title).split(/[:—–]/)[0].trim();
    const titleKeys = words(head);
    const GENERIC = new Set("definition definitions causes cause features clinical investigations investigation treatment complications prognosis prevention diagnosis history examination general principles factors other points common screening tests drugs summary introduction overview classification types management approach evaluation".split(" "));
    // a section gets a picture only when its heading names something specific (a condition, structure, chart or sign), searched on its own
    const heads = lines.map((l, i) => ({ i, h: ((l.match(/^#{2,4}\s+(?:\d+[.)]\s*)?(.+?)\s*$/) || [])[1] || "").replace(/\*+/g, "") }))
      .filter((x) => x.h && x.i > 3 && !/^(references?|common exam|key points?|exam|questions?|mcqs?)/i.test(x.h))
      .map((x) => ({ ...x, keys: words(x.h).filter((w) => !GENERIC.has(w)) })).filter((x) => x.keys.length > 0);
    const picked: { i: number; line: string; why: string }[] = [];
    const used = new Set<string>();
    let aiDown = false;
    const trace: string[] = [];
    // pass 1, no guessing: a heading or a bold term that is exactly the name of a Wikipedia article gets that article's own lead picture (placed in the section it came from)
    try {
      const allHeads = lines.map((l, i) => ({ i, h: ((l.match(/^#{2,4}\s+(?:\d+[.)]\s*)?(.+?)\s*$/) || [])[1] || "").replace(/\*+/g, "") })).filter((x) => x.h);
      const secOf = (lineNo: number) => { let best = allHeads[0]; for (const h of allHeads) { if (h.i <= lineNo) best = h; else break; } return best; };
      const cand: { term: string; sec: number }[] = [];
      const add = (term: string, lineNo: number) => {
        const t = term.replace(/\(.*?\)/g, " ").replace(/[^A-Za-z0-9' -]/g, " ").replace(/\s+/g, " ").trim();
        const n = t.split(" ").length;
        if (t.length < 4 || n > 4 || GENERIC.has(t.toLowerCase()) || /^(part|section|table|figure|note|key|why|what|how|when|signs?|causes?|red flags?)\b/i.test(t)) return;
        const sec = secOf(lineNo); if (!sec || sec.i < 3) return;
        if (!cand.some((c) => c.term.toLowerCase() === t.toLowerCase())) cand.push({ term: t.charAt(0).toUpperCase() + t.slice(1), sec: sec.i });
      };
      lines.forEach((l, i) => {
        const hm = l.match(/^#{2,4}\s+(?:\d+[.)]\s*)?(.+?)\s*$/);
        if (hm) { const h = hm[1].replace(/\*+/g, ""); add(h.split(/[:—–(]/)[0], i); h.split(/\s*(?:,| and | or |\/)\s*/).forEach((s2) => add(s2, i)); }
        else for (const b of l.matchAll(/\*\*([^*]{3,40})\*\*/g)) add(b[1].replace(/[:.]$/, ""), i);
      });
      const found = await wikiExact(cand.map((c) => c.term).slice(0, 120));
      const takenSec = new Set<number>();
      for (const c of cand) {
        const f = found.get(c.term); if (!f || used.has(f.url) || takenSec.has(c.sec) || picked.length >= 6) continue;
        used.add(f.url); takenSec.add(c.sec);
        const cap = `${f.title} · Image from the Wikipedia article, Wikimedia Commons`.replace(/[\[\]()\n]/g, " ").replace(/\s+/g, " ");
        picked.push({ i: c.sec, line: `![${cap}](${f.url})`, why: `Wikipedia: ${f.title}` });
        trace.push(`exact: ${c.term}`);
      }
    } catch (e) { trace.push(`exact pass failed ${String(e).slice(0, 60)}`); }
    let tries = 0;
    for (const sec of heads.slice(0, picked.length >= 3 ? 0 : 16)) {
      if (tries++ >= 12) break;
      if (picked.length >= 5) break;
      const secKeys = sec.keys.length > 2 ? [...sec.keys].sort((x, y) => y.length - x.length).slice(0, 2) : sec.keys; // a long heading is searched by its two most specific words
      const q = secKeys.join(" ");
      const cands = (await commons(q)).filter((c, k, arr) => arr.findIndex((x) => x.url === c.url) === k && !used.has(c.url));
      // the picture's own title/description must name what the heading is about (all of its key words when there are one or two)
      const need = secKeys.length;
      const ok = cands.filter((c) => { const hay = `${c.title} ${c.about}`.toLowerCase(); return secKeys.filter((w) => hay.includes(w)).length >= need; }).slice(0, 6);
      trace.push(`${sec.h}: ${cands.length} found, ${ok.length} named it`);
      if (!ok.length) continue;
      let pickIdx = -1;
      try {
        const raw = await chatText(Deno.env.toObject(), [{ role: "user", content: `A medical study note "${a.title}" has a section headed "${sec.h}". Which ONE picture below is clearly and directly about the subject of that section (a diagram, chart, clinical photo or scan a student would expect to see there)? Reject anything off-topic, generic, a different condition, or doubtful. Answer ONLY with the number, or -1.\n${ok.map((c, k) => `${k}. ${c.title} — ${c.about}`).join("\n")}` }], { temperature: 0, maxTokens: 20, timeoutMs: 25000, manual: !cronOk });
        const m = raw.match(/-?\d+/); pickIdx = m ? Number(m[0]) : -1; trace.push(`  AI said ${raw.slice(0, 20)}`);
      } catch (e) { aiDown = true; pickIdx = -1; trace.push(`  AI failed ${String(e).slice(0, 80)}`); }
      const c = ok[pickIdx]; if (!c) continue;
      used.add(c.url);
      const cap = `${c.title}  · ${c.credit}, ${c.licence}, Wikimedia Commons`.replace(/[\[\]()\n]/g, " ").replace(/\s+/g, " ").slice(0, 200);
      picked.push({ i: sec.i, line: `![${cap}](${c.url.split("?")[0]})`, why: c.title });
    }
    // no section had a picture it could be sure of: use the lead picture of the Wikipedia article on the note's subject, so no note is left without one
    if (!picked.length && !aiDown) {
      try {
        const lead = await wikiLead(head, titleKeys);
        if (lead) {
          const first = lines.findIndex((l, i) => i > 2 && /^#{2,4}\s/.test(l));
          if (first > 0) { picked.push({ i: first, line: `![${lead.caption}](${lead.url})`, why: `Wikipedia: ${lead.title}` }); trace.push(`lead picture: ${lead.title}`); }
        }
      } catch { /* no lead picture */ }
    }
    let added = 0;
    for (const p of picked.sort((x, y) => y.i - x.i)) if (insertAfterFirstPara(lines, p.i, p.line)) added++;
    if (added) await supabase.from("articles").update({ content: lines.join("\n") }).eq("id", a.id);
    await supabase.from("note_image_runs").upsert({ article_id: a.id, added: added === 0 && aiDown ? -1 : added, tried_at: new Date().toISOString() });
    return json({ success: true, title: a.title, added, pictures: picked.map((p) => p.why), trace });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
