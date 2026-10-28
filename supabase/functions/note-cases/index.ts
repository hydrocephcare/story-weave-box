// Writes one clinical simulator case from a study note, so every clinical note also becomes a patient to work up on the wards.
// Called by the schedule (x-cron-key) or by a signed-in administrator. One note per call; a note that already has a case is skipped.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { chatText } from "../_shared/aiChat.js";
import { cleanTopicTitle } from "../_shared/topicTitle.js";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

const ROTATION: [RegExp, string][] = [[/internal medicine|medicine/i, "medicine"], [/paediatric|pediatric|child/i, "paeds"], [/surgery|surgical/i, "surgery"], [/obstetric|gynaecolog|gynecolog/i, "obgyn"], [/psychiatr/i, "psychiatry"]];
const NOT_A_CASE = /\b(cat|mcqs?|exam|papers?|questions?|outline|syllabus|osce)\b/i;
const SYSTEMS = ["Cardiovascular", "Respiratory", "Renal / urinary", "Gastrointestinal / hepatobiliary", "Neurological", "Endocrine / metabolic", "Haematological", "Infective / immune", "Musculoskeletal / trauma", "Obstetric / gynaecological", "Psychiatric", "Toxic / drug-related"];
const SKILLS = ["history", "examination", "differentials", "investigations", "interpretation", "emergency", "management", "pathophysiology", "consultant", "presentation", "problemlist", "pharmacology", "reporting", "imaging", "communication"];

const SYSTEM = `You write ONE realistic clinical case for Kenyan Year 4 medical students (ward-round simulator) from ONE study note. The patient must have the condition the note teaches, but the case must NOT name it: the student has to work it out. Use only clinical facts that are in the note or are standard textbook medicine; never invent doses or criteria the note contradicts. Write in plain, exact clinical English. Return ONLY one JSON object, no markdown, in this shape:

{
 "title": "the clinical picture in 3-8 words, never the diagnosis (e.g. \\"Breathless with swollen legs\\")",
 "level": 1 | 2 | 3   (1 foundation, 2 core, 3 challenging),
 "setting": "where the patient presents, one short line",
 "involved": ["body systems that genuinely contribute, chosen ONLY from: ${SYSTEMS.join(" | ")}"],
 "emergency": true | false,
 "vignette": "2-4 sentences: age, sex, occupation, main complaint, duration, one or two telling features. No diagnosis.",
 "history": [ 14-18 items: {"id":"h1","group":"Presenting complaint | Associated symptoms | Past history | Drugs and allergies | Family and social | Risk factors","label":"the question a student would ask, e.g. Ask about the duration","answer":"what the patient says, first person, plain words","why":"why a good clinician asks this","key":true|false} ; 6-8 of them key ],
 "exam": [ 10-14 items: {"id":"e1","group":"General | Vitals | Cardiovascular | Respiratory | Abdomen | Neurological | Other","label":"what the student does, e.g. Check the pulse","finding":"what is found, with numbers where relevant","looking":"what this examination is looking for","key":true|false} ; 4-6 key ],
 "investigations": [ 8-12 items: {"id":"i1","group":"Bedside | Blood | Imaging | Other","label":"test name","result":"the result with values and units","meaning":"what it tells you","use":"key | useful | low"} ; 3-5 key, 2-3 low-value or unnecessary tests ],
 "interpret": [ 2 questions about reading the results, mcq format below ],
 "ddx": [ 4-5 items: {"name":"diagnosis","aliases":["other names or abbreviations"],"tier":"likely | possible | dangerous","why":"why it is on the list","for":["findings in this patient for it"],"against":["findings against it"],"ask":"the one history question that separates it","exam":"the one examination finding that separates it","ix":"the one test that separates it"} ; the true diagnosis is "likely"; include at least one "dangerous" cannot-miss ],
 "dx": mcq asking for the most likely diagnosis,
 "mgmt": mcq asking for the best next step in management,
 "consultant": [ 2 consultant-style mcq questions on mechanism, complication or treatment ],
 "chain": {"risk":"","patho":"","symptoms":"","signs":"","ix":"","dx":"","mx":"","comp":""}  (one short line each, the chain from risk factor to complication),
 "mustKnow": [4-6 one-line must-know facts],
 "thinkIf": [ 3 pairs ["if you see THIS finding","think of THESE conditions"] ],
 "revise": "a short search phrase for the topic"
}

mcq format: {"skill":"one of ${SKILLS.join(", ")}","q":"the question","options":[{"t":"option text","ok":true|false,"why":"why it is right or wrong"} x4, exactly ONE ok],"hints":["a gentle first hint","a stronger second hint"],"explain":"the teaching point in 2-3 sentences"}
REAL PHOTOS: on an exam or investigations item you MAY add "image_query": 2 to 5 plain English words you would type into a Wikimedia Commons search for a real clinical photograph or radiograph of that finding, e.g. "venous ulcer leg", "burn leg second degree", "chest x-ray pulmonary oedema", "goitre neck", "jaundice sclera". Use it ONLY for findings a photo or X-ray actually shows (a burn, ulcer, rash, swelling, deformity, jaundice, X-ray, ECG). NEVER for faces, genitals or breasts. At most 3 per case.
PICTURES: if a numbered list of pictures from the note is given, you MAY add "image": <number> to an investigations or exam item, ONLY when that picture clearly shows that very finding (for example the ECG, chest X-ray, ultrasound or clinical photo for that test or sign). Use each picture at most once, never guess, and leave the field out when none fits.
Ids must be unique short strings (h1.., e1.., i1..). The case must be internally consistent: the history, examination and results all fit the one diagnosis.`;

const str = (v: unknown, max = 600) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const arr = (v: unknown) => (Array.isArray(v) ? v : []);

function mcq(raw: any, id: string) {
  const options = arr(raw?.options).map((o: any) => ({ t: str(o?.t, 220), ok: o?.ok === true, why: str(o?.why, 400) })).filter((o) => o.t);
  if (!raw?.q || options.length < 3 || options.filter((o) => o.ok).length !== 1) return null;
  const skill = SKILLS.includes(raw.skill) ? raw.skill : "management";
  return { id, skill, q: str(raw.q, 500), options, hints: arr(raw.hints).map((h) => str(h, 240)).filter(Boolean).slice(0, 3), explain: str(raw.explain, 700) };
}

/** Turns the writer's answer into a case the simulator can run, or returns why it cannot. */
function toCase(raw: any, caseId: string, rotation: string, pics: { url: string; alt: string }[] = []): { def?: any; why?: string } {
  const hx: Record<string, string> = {}; const hxExtra: any[] = []; const hxKey: string[] = [];
  const seenH = new Set<string>();
  for (const [i, h] of arr(raw?.history).entries()) {
    const id = `h${i + 1}`; if (!h?.label || !h?.answer || seenH.has(id)) continue; seenH.add(id);
    hxExtra.push({ id, group: str(h.group, 40) || "History", label: str(h.label, 120), def: str(h.answer, 400), why: str(h.why, 300) });
    if (h.key === true) hxKey.push(id);
  }
  const ex: Record<string, string> = {}; const exExtra: any[] = []; const exKey: string[] = [];
  for (const [i, e] of arr(raw?.exam).entries()) {
    const id = `e${i + 1}`; if (!e?.label || !e?.finding) continue;
    const pic = Number.isInteger(e?.image) ? pics[e.image - 1] : undefined;
    exExtra.push({ id, group: str(e.group, 40) || "Examination", label: str(e.label, 120), def: str(e.finding, 400), looking: str(e.looking, 300), ...(pic ? { img: pic.url, imgAlt: pic.alt } : {}), ...(!pic && e?.image_query ? { _q: str(e.image_query, 60) } : {}) });
    if (e.key === true) exKey.push(id);
  }
  const ix = arr(raw?.investigations).map((x: any, i: number) => ({ id: `i${i + 1}`, group: str(x?.group, 30) || "Tests", label: str(x?.label, 120), result: str(x?.result, 400), meaning: str(x?.meaning, 400), use: ["key", "useful", "low"].includes(x?.use) ? x.use : "useful", ...(Number.isInteger(x?.image) && pics[x.image - 1] ? { img: pics[x.image - 1].url, imgAlt: pics[x.image - 1].alt } : x?.image_query ? { _q: str(x.image_query, 60) } : {}) })).filter((x: any) => x.label && x.result);
  const interpret = arr(raw?.interpret).map((m: any, i: number) => mcq(m, `${caseId}-int${i + 1}`)).filter(Boolean);
  const consultant = arr(raw?.consultant).map((m: any, i: number) => mcq(m, `${caseId}-con${i + 1}`)).filter(Boolean);
  const dxQ = mcq(raw?.dx, `${caseId}-dx`); const mgmtQ = mcq(raw?.mgmt, `${caseId}-mgmt`);
  const ddx = arr(raw?.ddx).map((d: any) => ({
    name: str(d?.name, 100), aliases: arr(d?.aliases).map((a) => str(a, 60)).filter(Boolean).slice(0, 6), tier: ["likely", "possible", "dangerous"].includes(d?.tier) ? d.tier : "possible",
    why: str(d?.why, 400), for: arr(d?.for).map((a) => str(a, 200)).slice(0, 5), against: arr(d?.against).map((a) => str(a, 200)).slice(0, 5),
    separate: { ask: str(d?.ask, 250), exam: str(d?.exam, 250), ix: str(d?.ix, 250) },
  })).filter((d: any) => d.name);
  if (hxExtra.length < 10 || hxKey.length < 3) return { why: "too little history" };
  if (exExtra.length < 7 || exKey.length < 2) return { why: "too little examination" };
  if (ix.length < 6 || ix.filter((x: any) => x.use === "key").length < 2) return { why: "too few investigations" };
  if (interpret.length < 1 || consultant.length < 1 || !dxQ || !mgmtQ) return { why: "questions missing" };
  if (ddx.length < 3 || !ddx.some((d: any) => d.tier === "likely")) return { why: "differentials missing" };
  const involved = arr(raw?.involved).filter((s) => SYSTEMS.includes(s));
  if (!involved.length) return { why: "no systems" };
  const chain = raw?.chain || {};
  return {
    def: {
      id: caseId, rotation, title: str(raw.title, 90), level: [1, 2, 3].includes(raw.level) ? raw.level : 2, setting: str(raw.setting, 140) || "Medical ward admission", tags: [], involved,
      emergency: raw.emergency === true || undefined, vignette: str(raw.vignette, 700),
      hx, hxKey, hxExtra, ex, exKey, exExtra, hsets: [], esets: [], ix, interpret, ddx, dx: { q: dxQ }, mgmt: mgmtQ, consultant,
      chain: { risk: str(chain.risk, 220), patho: str(chain.patho, 260), symptoms: str(chain.symptoms, 220), signs: str(chain.signs, 220), ix: str(chain.ix, 220), dx: str(chain.dx, 220), mx: str(chain.mx, 260), comp: str(chain.comp, 220) },
      mustKnow: arr(raw?.mustKnow).map((m) => str(m, 220)).filter(Boolean).slice(0, 8),
      thinkIf: arr(raw?.thinkIf).filter((p) => Array.isArray(p) && p.length >= 2).map((p) => [str(p[0], 160), str(p[1], 200)]).slice(0, 5),
      revise: str(raw?.revise, 80),
    },
  };
}

const BAD_TITLE = /(logo|diagram|map|drawing|illustration|icon|flag|chart|graph|schema|cartoon|nude|genital|penis|vagina|breast|anus|rectal|face|portrait|child abuse)/i;
/** A freely licensed real photograph from Wikimedia Commons (CC0, public domain, CC BY or CC BY-SA), with the credit the licence asks for. */
async function commonsPhoto(query: string): Promise<{ img: string; credit: string; link: string; title: string } | null> {
  if (!query || BAD_TITLE.test(query)) return null;
  try {
    const q = `${query} filetype:bitmap -diagram -drawing -illustration`;
    const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=10&gsrsearch=${encodeURIComponent(q)}&prop=imageinfo&iiprop=url%7Cextmetadata%7Cmime%7Csize&iiurlwidth=900`;
    const r = await fetch(url, { headers: { "user-agent": "OmpathStudy/1.0 (https://www.ompathstudy.com; medical education)" } });
    if (!r.ok) return null;
    const j = await r.json();
    const pages = (Object.values(j?.query?.pages ?? {}) as any[]).sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
    // ACCURACY: a picture is used only when the file's own title, description or categories name what the case shows (every key word of the search, allowing the
    // usual alternatives); the best match wins, and a search with no real match gives no picture rather than a wrong one.
    const words = query.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2);
    const alt: Record<string, string[]> = { xray: ["x-ray", "xray", "radiograph", "radiography"], "x": ["x-ray"], scan: ["ct", "scan", "tomography"], ulcer: ["ulcer", "ulceration"], ulcers: ["ulcer", "ulceration"], burn: ["burn", "burns", "scald"], burns: ["burn", "burns", "scald"], oedema: ["oedema", "edema"], edema: ["oedema", "edema"], ecg: ["ecg", "ekg", "electrocardiogram"] };
    const key = words.filter((w) => !["the", "and", "with", "from"].includes(w));
    let best: { score: number; out: { img: string; credit: string; link: string; title: string } } | null = null;
    for (const p of pages) {
      const ii = p?.imageinfo?.[0]; if (!ii) continue;
      if (!/^image\/(jpeg|png)$/.test(ii.mime || "") || (ii.width || 0) < 500 || BAD_TITLE.test(String(p.title || ""))) continue;
      const lic = String(ii.extmetadata?.LicenseShortName?.value || "");
      if (!/^(CC0|CC BY|CC BY-SA|Public domain|PD)/i.test(lic)) continue;
      const strip = (v: unknown) => String(v ?? "").replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/g, " ");
      const hay = `${String(p.title || "").replace(/^File:/, "").replace(/[_.]/g, " ")} ${strip(ii.extmetadata?.ImageDescription?.value)} ${strip(ii.extmetadata?.Categories?.value)}`.toLowerCase();
      // a picture of a NORMAL finding would mislead for a case about disease
      if (/\bnormal\b/.test(hay.slice(0, 200)) && !/\bnormal\b/.test(query.toLowerCase())) continue;
      // no photographs of children unless the search itself is about children
      if (/(child|boy|girl|infant|baby|toddler|newborn|neonat|pakistani)/i.test(hay.slice(0, 300)) && !/(child|infant|baby|toddler|newborn|neonat|paed|pediat)/i.test(query)) continue;
      const hits = key.filter((w) => (alt[w] ?? [w]).some((a) => hay.includes(a))).length;
      if (key.length && hits < Math.max(1, Math.ceil(key.length * 0.75))) continue;
      const by = strip(ii.extmetadata?.Artist?.value).replace(/\s+/g, " ").trim().slice(0, 70) || "Unknown author";
      const out = { img: ii.thumburl || ii.url, credit: `Photo: ${by}, ${lic}, Wikimedia Commons`, link: ii.descriptionurl || "https://commons.wikimedia.org", title: String(p.title || "").replace(/^File:/, "").replace(/\.[a-z]+$/i, "").replace(/[_]/g, " ").slice(0, 100) };
      if (!best || hits > best.score) best = { score: hits, out };
    }
    if (best) return best.out;
  } catch { /* a missing picture never stops a case */ }
  return null;
}

const VISIBLE = /(ulcer|burn|scald|wound|rash|lesion|blister|cellulitis|gangren|abscess|swelling|oedema|edema|jaundice|goitre|goiter|deformit|scar|eczema|psoria|pustul|necrosis|erythema|clubbing|cyanosis|pallor|hernia|varicose|rickets|kwashiorkor|oedematous|ascites|distension)/i;
const IMAGING = /(x-ray|xray|radiograph|chest film|plain film|ct |ultrasound|ecg|electrocardiogram|barium|angiogra)/i;
/** When the writer did not ask for pictures, pick the visible findings and the imaging itself and search for them under the condition's name. */
function deriveQueries(def: any, topic: string) {
  const cond = topic.split(/[:(,\-]/)[0].replace(/\b(notes?|management|overview|guide|assessment|disease|and|of|the)\b/gi, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, 4).join(" ");
  if (!cond) return;
  const items = [...def.exExtra, ...def.ix];
  if (items.some((i: any) => i._q || i.img)) return;
  const vis = def.exExtra.find((e: any) => VISIBLE.test(`${e.label} ${e.def}`));
  if (vis) { const m = VISIBLE.exec(`${vis.label} ${vis.def}`)![0].toLowerCase(); vis._q = cond.toLowerCase().includes(m) ? cond : `${cond} ${m}`; }
  const img = def.ix.find((x: any) => IMAGING.test(x.label));
  if (img) { const mod = /ecg|electrocardiogram/i.test(img.label) ? "ecg" : /ultrasound/i.test(img.label) ? "ultrasound" : /ct /i.test(img.label) ? "ct scan" : "x-ray"; img._q = `${cond} ${mod}`; }
}

function parseObject(text: string) {
  const s = text.indexOf("{"); const e = text.lastIndexOf("}");
  if (s < 0 || e <= s) return null;
  try { return JSON.parse(text.slice(s, e + 1)); } catch { return null; }
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

    // a clinical note (a Year 4 rotation) that has no case yet; notes are taken in random order so every rotation gets cases
    const { data: used } = await supabase.from("ai_cases").select("source_article_id");
    const usedIds = new Set((used ?? []).map((r: any) => r.source_article_id));
    const { data: pool } = await supabase.from("articles").select("id, title, category, created_at").eq("published", true).is("deleted_at", null).or("category.ilike.%medicine%,category.ilike.%paediatric%,category.ilike.%surgery%,category.ilike.%obstetric%,category.ilike.%gynaecolog%,category.ilike.%psychiatr%").limit(1500);
    const options = (pool ?? []).filter((a: any) => !usedIds.has(a.id) && !NOT_A_CASE.test(a.title || "") && ROTATION.some(([re]) => re.test(a.category || "")));
    let id = body?.article_id as string | undefined;
    if (!id) { if (!options.length) return json({ success: true, done: true }); id = options[Math.floor(Math.random() * options.length)].id; }
    const { data: a, error } = await supabase.from("articles").select("id, title, category, content, slug").eq("id", id).single();
    if (error || !a) return json({ error: error?.message || "not found" }, 500);
    const rotation = (ROTATION.find(([re]) => re.test(a.category || "")) ?? [null, "medicine"])[1] as string;
    const raw0 = String(a.content).replace(/\r\n/g, "\n");
    // pictures in the note that sit on this site (a student can always load them), up to 8, offered to the writer by number
    const pics = [...raw0.matchAll(/!\[([^\]]*)\]\((https:\/\/(?:www\.|cdn\.)?ompathstudy\.com\/[^)\s]+)\)/g)].map((m) => ({ alt: str(m[1], 120), url: m[2] })).filter((p, i, all) => all.findIndex((q) => q.url === p.url) === i).slice(0, 8);
    const text = raw0.replace(/!\[[^\]]*\]\([^)]*\)/g, "").slice(0, 9000);
    if (text.length < 1200) { await supabase.from("ai_cases").insert({ id: `ai-${String(a.id).replace(/-/g, "").slice(0, 8)}`, rotation, title: a.title, def: { skipped: "note too short" }, source_article_id: a.id, status: "skipped" }); return json({ success: true, status: "skipped", why: "note too short" }); }

    const caseId = `ai-${String(a.id).replace(/-/g, "").slice(0, 8)}`;
    let result: ReturnType<typeof toCase> = { why: "no answer" }; let lastErr = "";
    for (let attempt = 0; attempt < 3 && !result.def; attempt++) {
      try {
        const raw = await chatText(Deno.env.toObject(), [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Write the case from this note.\nROTATION: ${rotation}\nNOTE TITLE: ${cleanTopicTitle(a.title)}\nSUBJECT: ${a.category}${pics.length ? `\nPICTURES IN THE NOTE:\n${pics.map((p, i) => `${i + 1}. ${p.alt || "picture"}`).join("\n")}` : ""}\n\n${text}` },
        ], { temperature: 0.4, maxTokens: 9000, timeoutMs: 90000, manual: !cronOk });
        const parsed = parseObject(raw);
        result = parsed ? toCase(parsed, caseId, rotation, pics) : { why: "not valid JSON" };
      } catch (e) { lastErr = e instanceof Error ? e.message.slice(0, 120) : String(e); }
    }
    if (!result.def) {
      // a note that keeps failing is parked so the schedule moves on; a busy AI is simply retried next time
      if (!lastErr) await supabase.from("ai_cases").insert({ id: caseId, rotation, title: a.title, def: { failed: result.why, at: new Date().toISOString() }, source_article_id: a.id, status: "failed" });
      return json({ success: true, status: "skipped", why: lastErr || result.why });
    }
    // where the case came from, so a ward round can be built per unit and the case can link back to its note
    result.def.category = a.category; result.def.sourceTitle = cleanTopicTitle(a.title); result.def.sourceSlug = String(a.slug || "").replace(/-[0-9a-f]{6,12}$/i, "");
    // real photographs for up to 3 findings the writer asked a picture for (own-site pictures from the note were already attached)
    deriveQueries(result.def, result.def.sourceTitle || a.title);
    let looked = 0;
    for (const it of [...result.def.exExtra, ...result.def.ix]) {
      if (it._q !== undefined) { if (!it.img && looked < 3) { looked++; const ph = await commonsPhoto(it._q); if (ph) { it.img = ph.img; it.imgAlt = ph.title || it._q; it.imgCredit = ph.credit; it.imgLink = ph.link; } } delete it._q; }
    }
    const { error: insErr } = await supabase.from("ai_cases").insert({ id: caseId, rotation, title: result.def.title, level: result.def.level, def: result.def, source_article_id: a.id, status: "published" });
    if (insErr) return json({ error: insErr.message }, 500);
    return json({ success: true, title: result.def.title, from: a.title });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
