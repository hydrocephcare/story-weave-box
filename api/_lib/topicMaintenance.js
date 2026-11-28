import { neon } from "@neondatabase/serverless";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { pickSubject } from "../../supabase/functions/_shared/topicParts.js";
import { askModel, askGroqModel, generateReviewedTopicPage } from "../../supabase/functions/_shared/topicAi.js";
import { generateCheckedDeep, checkContent } from "../../supabase/functions/_shared/contentCheck.js";
import { supabaseAiEnv } from "./supabaseAiEnv.js";
import { hardenBatch, weakness } from "../../supabase/functions/_shared/mcqHarden.js";
import { placeNewQuestions } from "../../supabase/functions/_shared/mcqPositions.js";
import { cleanTopicTitle } from "../../supabase/functions/_shared/topicTitle.js";

const AUDIENCE = "ompathstudy-topic-maintenance";
const REPOSITORY = "hydrocephcare/story-weave-box";
const WORKFLOW_REFS = new Set([
  "hydrocephcare/story-weave-box/.github/workflows/topics-daily.yml@refs/heads/main",
  "hydrocephcare/story-weave-box/.github/workflows/zone-daily.yml@refs/heads/main",
]);
const jwks = createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
let database;
const getDb = () => {
  if (!databaseUrl) throw new Error("Server-side Neon DATABASE_URL is not configured.");
  database ||= neon(databaseUrl);
  return database;
};

const TABLES = {
  articles: {
    columns: "id,title,slug,category,content,created_at,updated_at",
    where: "published = true AND deleted_at IS NULL",
    order: "created_at DESC",
  },
  mcq_sets: {
    columns: "id,title,slug,category,questions,created_at,updated_at",
    where: "published = true AND deleted_at IS NULL",
    order: "created_at DESC",
  },
  essays: {
    columns: "id,title,slug,category,short_answer_questions,long_answer_questions,created_at,updated_at",
    where: "published = true AND deleted_at IS NULL",
    order: "created_at DESC",
  },
  topic_pages: {
    columns: "slug,name,category,content,reviewed,updated_at,ai_review_status",
    where: "status = 'published'",
    order: "updated_at DESC",
  },
};

async function verifyWorkflow(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: "https://token.actions.githubusercontent.com",
      audience: AUDIENCE,
    });
    return payload.repository === REPOSITORY
      && payload.ref === "refs/heads/main"
      && WORKFLOW_REFS.has(String(payload.workflow_ref || ""))
      && ["push", "schedule", "workflow_dispatch"].includes(String(payload.event_name));
  } catch {
    return false;
  }
}


function cleanStudyNote(value) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/!\[[^\]]*\]\([^)]*\)/g, "").slice(0, 12000);
}
function parseNoteMcqs(raw) {
  const text=String(raw||""); const start=text.indexOf("["); const end=text.lastIndexOf("]");
  if(start<0||end<=start)return [];
  let data; try{data=JSON.parse(text.slice(start,end+1));}catch{return [];}
  if(!Array.isArray(data))return [];
  return data.filter(q=>q?.question&&Array.isArray(q.options)&&q.options.length>=4&&Number.isInteger(q.correct_answer)&&q.correct_answer>=0&&q.correct_answer<=3)
    .map(q=>({question:String(q.question).trim(),options:q.options.slice(0,4).map(x=>String(x).trim()),correct_answer:q.correct_answer,explanation:String(q.explanation||"").trim()}))
    .filter(q=>q.question.length>=12&&q.options.every(x=>x.length>0)&&new Set(q.options.map(x=>x.toLowerCase())).size===4&&!/all of the above|none of the above/i.test(q.options.join(" ")));
}
function parseNoteCards(raw) {
  const text=String(raw||""); const start=text.indexOf("["); const end=text.lastIndexOf("]");
  if(start<0||end<=start)return [];
  let data; try{data=JSON.parse(text.slice(start,end+1));}catch{return [];}
  if(!Array.isArray(data))return [];
  const seen=new Set();
  return data.filter(c=>c?.question&&c?.answer).map(c=>({question:String(c.question).trim(),answer:Array.isArray(c.answer)?c.answer.map(x=>"- "+String(x)).join("\n"):String(c.answer).trim()}))
    .filter(c=>{const key=c.question.toLowerCase().replace(/[^a-z0-9]+/g," ").slice(0,60);if(key.length<8||seen.has(key)||c.answer.length<30)return false;seen.add(key);return true;});
}
function dedupeNoteMcqs(items, existing=[]) {
  const seen=new Set(existing.map(q=>String(q.question||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim().slice(0,60)));
  return items.filter(q=>{const key=q.question.toLowerCase().replace(/[^a-z0-9]+/g," ").trim().slice(0,60);if(seen.has(key))return false;seen.add(key);return true;});
}
async function generateNoteMcqs(article, env, count=24, avoid=[]) {
  const text=cleanStudyNote(article.content);
  const prompt=`Write exactly ${count} challenging single-best-answer MCQs for medical students from this study note.
At least two thirds should be short clinical vignettes. Each question must have exactly four plausible options, one best answer, a 0-based correct_answer index, and a concise explanation.
Do not use all/none of the above. Do not make the correct option conspicuously longer. Use only supported facts; never invent doses or diagnostic criteria.
Return ONLY a JSON array of objects: {"question":"...","options":["...","...","...","..."],"correct_answer":0,"explanation":"..."}.
TOPIC: ${article.title} | ${article.category}
AVOID REPEATING: ${avoid.slice(0,30).map(q=>String(q).slice(0,120)).join("\n")}
SOURCE NOTE:
${text}`;
  const draft=await askModel(prompt,{env,plain:true,timeoutMs:55000,maxTokens:6500});
  let questions=parseNoteMcqs(draft.text);
  if(questions.length<Math.max(8,Math.floor(count*0.55)))throw new Error("MCQ generation returned too few valid questions.");
  const weak=questions.map((q,i)=>weakness(q).some(w=>w!=="recall")?i:-1).filter(i=>i>=0).slice(0,8);
  if(weak.length){try{const fixed=await hardenBatch(env,weak.map(i=>questions[i]),{subject:article.title+" ("+article.category+")"});weak.forEach((i,k)=>{if(fixed[k])questions[i]={...fixed[k]};});}catch{}}
  questions=placeNewQuestions(dedupeNoteMcqs(questions,avoid));
  const review=await checkContent({title:article.title,kind:"medical multiple-choice questions",text:JSON.stringify(questions),env,timeoutMs:45000});
  if(!review.validated)throw new Error("MCQs failed independent medical review: "+(review.issues||[]).slice(0,3).map(x=>x.problem).join("; "));
  return {questions,review};
}
async function generateNoteFlashcards(article, env) {
  const text=cleanStudyNote(article.content).slice(0,10000);
  const count=Math.max(10,Math.min(22,Math.round(text.length/450)));
  const prompt=`Create ${count} high-yield revision flashcards for medical students from this study note.
Each card covers one distinct angle: definition, causes, pathophysiology, clinical features, classification, investigations, differentials, management/pharmacology, complications, ward-round points, prognosis or prevention. Use only angles supported by the note.
Each answer is 35–60 words: a direct answer, then 3–4 short explanatory lines, and a final Related line. Do not repeat facts across cards. No invented doses or criteria.
Return ONLY JSON array: [{"question":"...","answer":"..."}].
TOPIC: ${article.title} | ${article.category}
SOURCE NOTE:
${text}`;
  // Drafting is deliberately Groq-only. Gemini remains an independent clinical reviewer.
  const draft=await askGroqModel(prompt,{env,plain:true,timeoutMs:55000,maxTokens:7000});
  let cards=parseNoteCards(draft.text);
  if(cards.length<8)throw new Error("Flashcard generation returned too few distinct usable cards.");

  let review=await checkContent({
    title:article.title,
    kind:"medical revision flashcards",
    text:JSON.stringify(cards),
    env,
    timeoutMs:45000,
  });

  // One controlled repair pass: Groq repairs only the issues identified by Gemini,
  // then Gemini independently reviews the complete repaired deck again.
  if(!review.validated){
    const issues=(review.issues||[]).map((item,index)=>
      (index+1)+". ["+item.where+"] "+item.problem+" Correct it to: "+item.fix
    ).join("\n");
    const repairPrompt=`Repair the medical accuracy and safety problems identified by an independent clinical reviewer.
Preserve the source-note scope, medical-student level and flashcard format. Do not introduce unsupported facts, doses or diagnostic thresholds.
Return ONLY a JSON array of flashcards with question and answer fields.
REVIEW FINDINGS:
${issues}
CURRENT FLASHCARDS:
${JSON.stringify(cards)}
SOURCE NOTE:
${text}`;
    const repaired=await askGroqModel(repairPrompt,{env,plain:true,timeoutMs:55000,maxTokens:7000});
    const repairedCards=parseNoteCards(repaired.text);
    if(repairedCards.length<8)throw new Error("Clinically repaired flashcard deck was incomplete; nothing was saved.");
    cards=repairedCards;
    review=await checkContent({
      title:article.title,
      kind:"medical revision flashcards",
      text:JSON.stringify(cards),
      env,
      timeoutMs:45000,
    });
  }

  if(!review.validated){
    throw new Error("Flashcards failed independent Gemini clinical review; nothing was saved.");
  }
  return {cards,review};
}

function deepReady(deep) {
  return Boolean(deep?.checked) && (deep?.sections?.length || 0) >= 7
    && (deep?.vivas?.length || 0) >= 12 && (deep?.mcqs?.length || 0) >= 6
    && (deep?.cases?.length || 0) >= 2 && (deep?.facts?.length || 0) >= 6
    && (deep?.mistakes?.length || 0) >= 5 && (deep?.exam?.length || 0) >= 12;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!(await verifyWorkflow(req))) return res.status(401).json({ error: "A valid Ompath topic-maintenance workflow token is required." });

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const task = String(body.task || "");
  const aiEnv = supabaseAiEnv(req, { workflow: true });

  try {
    if (task === "health") {
      const rows = await getDb()`SELECT count(*)::int AS count FROM public.topic_pages WHERE status = 'published'`;
      return res.status(200).json({ ok: true, publishedTopics: Number(rows[0]?.count || 0) });
    }

    if (task === "zone-topics") {
      const rows = await getDb()`SELECT title,category FROM public.mcq_sets
        WHERE published=true AND deleted_at IS NULL AND title IS NOT NULL
        ORDER BY updated_at DESC LIMIT 1000`;
      const seen = new Set();
      const topics = rows.map((row) => {
        const year = /^Year\s*(\d)/i.exec(String(row.category || ""))?.[1];
        const name = String(row.title || "").replace(/\b(MCQs?|questions?|quiz|set|part)\b.*$/i, "")
          .replace(/[–—:|-]\s*$/, "").replace(/\s+/g, " ").trim();
        return { year: year ? Number(year) : 0, name, unit: String(row.category || "").replace(/^Year\s*\d\s*:\s*/i, "") };
      }).filter((item) => item.year >= 1 && item.year <= 6 && item.name.length > 3 && item.name.length < 60
        && !seen.has(item.name.toLowerCase()) && seen.add(item.name.toLowerCase()));
      return res.status(200).json({ topics });
    }

    if (task === "zone-write") {
      const kind = String(body.kind || "");
      const topic = body.topic && typeof body.topic === "object" ? body.topic : {};
      const name = String(topic.name || "").trim().slice(0, 100);
      const year = Number(topic.year);
      const unit = String(topic.unit || "").trim().slice(0, 100);
      if (!["quiz", "case", "drug"].includes(kind) || name.length < 4 || !Number.isInteger(year) || year < 1 || year > 6) {
        return res.status(400).json({ error: "Invalid daily game request." });
      }
      const groqEnv = aiEnv;
      const geminiEnv = aiEnv;
      const prompts = {
        quiz: `Write 10 multiple-choice questions on "${name}" (${unit}) for a Year ${year} MBChB student.`,
        case: `Write 8 short clinical case questions on "${name}" (${unit}) for a Year ${year} MBChB student. Each needs a 2–3 sentence vignette and asks for the most likely diagnosis or next best step.`,
        drug: `Write 8 pharmacology questions related to "${name}" (${unit}) for a Year ${year} MBChB student: drug class, mechanism, indication or characteristic adverse effect.`,
      };
      const label = kind === "case" ? "Case Showdown" : kind === "drug" ? "Drug Duel" : "Quiz";
      const parse = (raw) => {
        try {
          const text = String(raw || "");
          const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
          return (parsed.questions || []).filter((item) => item && item.q && Array.isArray(item.options)
            && item.options.length >= 3 && item.options.length <= 6
            && Number.isInteger(item.correct) && item.correct >= 0 && item.correct < item.options.length
            && new Set(item.options.map(String)).size === item.options.length)
            .map((item) => ({ q: String(item.q).slice(0, 700), options: item.options.map((option) => String(option).slice(0, 200)),
              correct: item.correct, explanation: String(item.explanation || "").slice(0, 400), ai: true,
              kind: kind === "case" ? "case" : kind === "drug" ? "drug" : "mcq" }));
        } catch { return []; }
      };
      const prompt = prompts[kind] + " Reply with ONLY a JSON object containing a questions array. Each question must have four options, one clearly best answer, a correct index and a one-sentence explanation. No all-of-the-above. Use standard medical terminology and accepted medical facts only.";
      const draft = await askModel(prompt, { env: groqEnv, plain: true, timeoutMs: 45000, maxTokens: 5000 });
      let questions = parse(draft.text);
      if (questions.length < 5) return res.status(422).json({ validated: false, error: "The AI returned too few valid questions." });
      let review = await checkContent({ title: name + " " + label, kind: "medical MCQ, clinical case and pharmacology questions", text: JSON.stringify(questions), env: geminiEnv, timeoutMs: 45000 });
      if (!review.validated) {
        const repairPrompt = "Correct the medical or examination-quality problems listed below. Preserve the topic and year level. Ensure one best answer, plausible distractors and a clear explanation. Use accepted medical knowledge only. Output ONLY the complete JSON object with a questions array.\nISSUES:\n"
          + (review.issues || []).map((item, index) => (index + 1) + ". " + item.problem + " Fix: " + item.fix).join("\n")
          + "\nQUESTIONS:\n" + JSON.stringify(questions);
        const fixed = await askModel(repairPrompt, { env: groqEnv, plain: true, timeoutMs: 45000, maxTokens: 5000 });
        questions = parse(fixed.text);
        if (questions.length < 5) return res.status(422).json({ validated: false, error: "The repaired question set was incomplete." });
        review = await checkContent({ title: name + " " + label, kind: "medical MCQ, clinical case and pharmacology questions", text: JSON.stringify(questions), env: geminiEnv, timeoutMs: 45000 });
      }
      if (!review.validated) return res.status(422).json({ validated: false, issues: review.issues || [] });
      return res.status(200).json({ validated: true, questions, reviewModel: review.model || null });
    }


    if (task === "note-mcqs") {
      const candidate = body.article_id
        ? [{ id: String(body.article_id) }]
        : await getDb().query("SELECT id FROM public.note_mcq_candidates(1)");
      if (!candidate.length) {
        const top = body.set_id ? [{ id: String(body.set_id) }] : await getDb().query("SELECT id FROM public.note_mcq_topup_candidates(1)");
        if (!top.length) return res.status(200).json({ success: true, done: true });
        const sets = await getDb().query("SELECT id,title,category,questions,source_reference,original_notes FROM public.mcq_sets WHERE id=$1::uuid LIMIT 1",[top[0].id]);
        const set=sets[0]; if(!set) return res.status(404).json({error:"MCQ bank not found."});
        const src=await getDb().query("SELECT id,title,category,content FROM public.articles WHERE id=$1::uuid LIMIT 1",[set.source_reference]);
        const article=src[0]; if(!article) return res.status(200).json({success:true,status:"no source"});
        const have=Array.isArray(set.questions)?set.questions:[];
        const needed=Math.max(0,Math.min(30,Math.round(cleanStudyNote(article.content).length/250))-have.length);
        if(needed<4){await getDb().query("UPDATE public.mcq_sets SET original_notes=$2,updated_at=now() WHERE id=$1::uuid",[set.id,JSON.stringify({topped:true,topup_note:"already enough"})]);return res.status(200).json({success:true,status:"already enough"});}
        const extra=await generateNoteMcqs(article,aiEnv,Math.min(needed,18),have.map(q=>q.question));
        const merged=[...have,...placeNewQuestions(dedupeNoteMcqs(extra.questions,have.map(q=>q.question)),{existing:have})].slice(0,36);
        await getDb().query("UPDATE public.mcq_sets SET questions=$2::jsonb,meta_description=$3,original_notes=$4,updated_at=now() WHERE id=$1::uuid",[set.id,JSON.stringify(merged),`${merged.length} practice MCQs with explanations on ${String(article.title).slice(0,70)}, written from Ompath Study notes.`,JSON.stringify({topped:true,topup_note:"added "+(merged.length-have.length)})]);
        await getDb().query("DELETE FROM public.mcq_review_log WHERE set_id=$1::uuid",[set.id]);
        return res.status(200).json({success:true,status:"topped up",title:set.title,questions:merged.length});
      }
      const rows=await getDb().query("SELECT id,title,category,content FROM public.articles WHERE id=$1::uuid AND published=true AND deleted_at IS NULL LIMIT 1",[candidate[0].id]);
      const article=rows[0]; if(!article)return res.status(404).json({error:"Published study note not found."});
      const questionsResult=await generateNoteMcqs(article,aiEnv,Math.max(12,Math.min(30,Math.round(cleanStudyNote(article.content).length/250))));
      const title=`${cleanTopicTitle(article.title)}: MCQs`;
      const slug=`${title.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,70)}-${String(article.id).replace(/-/g,"").slice(0,8)}`;
      await getDb().query("INSERT INTO public.mcq_sets(title,slug,category,questions,published,source_reference,source_type,meta_description,original_notes,updated_at) VALUES($1,$2,$3,$4::jsonb,true,$5,'note_generated',$6,$7,now())",[title,slug,article.category,JSON.stringify(questionsResult.questions),String(article.id),`${questionsResult.questions.length} practice MCQs with explanations on ${cleanTopicTitle(article.title)}, written from Ompath Study notes.`,JSON.stringify({type:"note_mcqs",article_id:article.id,generated_at:new Date().toISOString(),reviewed:true,review_model:questionsResult.review.model||null})]);
      return res.status(200).json({success:true,title:article.title,questions:questionsResult.questions.length,reviewed:true});
    }

    if (task === "note-flashcards") {
      let candidate=body.article_id?[{id:String(body.article_id)}]:await getDb().query("SELECT id FROM public.note_flashcard_candidates(1)");
      let upgrade=null;
      if(!candidate.length){
        const old=await getDb().query(`SELECT id,source_reference FROM public.flashcard_sets WHERE source_type='note_generated' AND published=true AND deleted_at IS NULL AND coalesce(original_notes,'') NOT LIKE '%"v":2%' AND source_reference IS NOT NULL ORDER BY created_at ASC LIMIT 1`);
        if(old.length){candidate=[{id:old[0].source_reference}];upgrade={id:old[0].id};}
      }
      if(!candidate.length)return res.status(200).json({success:true,done:true});
      const rows=await getDb().query("SELECT id,title,category,content FROM public.articles WHERE id=$1::uuid AND published=true AND deleted_at IS NULL LIMIT 1",[candidate[0].id]);
      const article=rows[0];if(!article)return res.status(404).json({error:"Published study note not found."});
      const {cards,review}=await generateNoteFlashcards(article,aiEnv);
      const description=`${cards.length} flashcards to revise ${cleanTopicTitle(article.title)}, written from Ompath Study notes.`;
      const meta=JSON.stringify({type:"note_flashcards",v:3,article_id:article.id,generated_at:new Date().toISOString(),reviewed:true,review_model:review.model||null});
      if(upgrade){
        await getDb().query("UPDATE public.flashcard_sets SET cards=$2::jsonb,original_notes=$3,meta_description=$4,updated_at=now() WHERE id=$1::uuid",[upgrade.id,JSON.stringify(cards),meta,description]);
        return res.status(200).json({success:true,title:article.title,cards:cards.length,upgraded:true,reviewed:true,reviewModel:review.model||null});
      }
      const title=`${cleanTopicTitle(article.title)}: Flashcards`;
      const base=title.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,70);
      const slug=`${base}-${String(article.id).replace(/-/g,"").slice(0,8)}`;
      await getDb().query("INSERT INTO public.flashcard_sets(title,slug,category,cards,published,source_reference,source_type,meta_description,original_notes,updated_at) VALUES($1,$2,$3,$4::jsonb,true,$5,'note_generated',$6,$7,now())",[title,slug,article.category,JSON.stringify(cards),String(article.id),description,meta]);
      return res.status(200).json({success:true,title:article.title,cards:cards.length,reviewed:true,reviewModel:review.model||null});
    }

    if (task === "generate-publish") {
      const name = String(body.name || "").trim();
      const category = String(body.category || "").slice(0, 60);
      const context = String(body.context || "").slice(0, 5000);
      if (name.length < 4 || name.length > 80 || name.includes("<") || name.includes(">")) {
        return res.status(400).json({ error: "Invalid topic name." });
      }
      const requestedSlug = String(body.slug || "");
      const slug = requestedSlug || name.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/g, "");
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 80) return res.status(400).json({ error: "Invalid topic slug." });
      const existingRows = await getDb()`SELECT status,content FROM public.topic_pages WHERE slug = ${slug} LIMIT 1`;
      if (existingRows[0]?.status === "published" && existingRows[0]?.content) {
        return res.status(200).json({ ok: true, existing: true, slug, name, page: existingRows[0].content });
      }
      const dailyRows = await getDb()`SELECT count(*)::int AS count FROM public.topic_pages WHERE created_at > now() - interval '1 day'`;
      if (Number(dailyRows[0]?.count || 0) >= 150) {
        return res.status(429).json({ ok: false, reason: "daily_cap", error: "The Neon topic publishing limit of 150 pages per rolling day has been reached." });
      }
      const env = aiEnv;
      const generated = await generateReviewedTopicPage({ name, category, context }, { env });
      const generatedPage = generated?.page;
      if (!generatedPage) return res.status(422).json({ ok: false, reason: "no_page" });
      if (generatedPage.medical !== true) return res.status(200).json({ ok: true, medical: false, slug: body.slug || null, page: generatedPage });
      const page = { ...generatedPage, subject: pickSubject(generatedPage.subject, `${name} ${category}`) };
      if (page.aiReview?.status !== "passed" || !String(page.aiReview?.model || "").trim()
          || !Array.isArray(page.sections) || page.sections.length < 3
          || !Array.isArray(page.exam) || page.exam.length < 8
          || String(page.summary || "").length < 100 || JSON.stringify(page).length > 60000) {
        return res.status(422).json({ ok: false, reason: "review_or_structure" });
      }
      const rows = await getDb()`SELECT public.publish_topic_page_system(
        ${slug}, ${name}, ${category}, ${JSON.stringify(page)}::jsonb, ${page.model || "groq"}
      ) AS result`;
      const result = rows[0]?.result || { ok: false, reason: "empty_result" };
      if (!result.ok) return res.status(result.reason === "busy" ? 429 : 422).json(result);
      return res.status(200).json({ ...result, slug, name, page });
    }

    if (task === "publish") {
      const slug = String(body.slug || "");
      const name = String(body.name || "").trim();
      const category = String(body.category || "").slice(0, 60);
      const page = body.page;
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || !name || name.length > 80) {
        return res.status(400).json({ error: "Invalid topic identity." });
      }
      if (!page || typeof page !== "object" || page.medical !== true || page.aiReview?.status !== "passed"
          || !String(page.aiReview?.model || "").trim() || !Array.isArray(page.sections) || page.sections.length < 3
          || !Array.isArray(page.exam) || page.exam.length < 8 || String(page.summary || "").length < 100
          || JSON.stringify(page).length > 60000
          || (/https?:|javascript:|data:text/i.test(JSON.stringify(page)) || JSON.stringify(page).toLowerCase().includes("www.") || /<[a-z/!]/i.test(JSON.stringify(page)) || /(?:onerror|onload) *=/i.test(JSON.stringify(page)))) {
        return res.status(400).json({ error: "Topic did not pass the publication safeguards." });
      }
      const rows = await getDb()`SELECT public.publish_topic_page_system(
        ${slug}, ${name}, ${category}, ${JSON.stringify(page)}::jsonb, ${page.model || "groq"}
      ) AS result`;
      const result = rows[0]?.result || { ok: false, reason: "empty_result" };
      return res.status(result.ok ? 200 : result.reason === "busy" ? 429 : 422).json(result);
    }

    if (task === "summarize") {
      const title = String(body.title || "").slice(0, 240);
      const where = String(body.where || "").slice(0, 160);
      const sourceText = String(body.text || "").slice(0, 5000);
      if (title.length < 2 || sourceText.trim().length < 250) return res.status(400).json({ error: "A page title and at least 250 characters of source text are required." });
      const prompt = `You write the short "in a nutshell" for a medical study page.
Page: "${title}" (${where}).
Return ONLY JSON: {"summary":"2 or 3 plain sentences, 55 words at most, no hype, no drug doses","terms":["5 to 7 key terms from the page"]}.
Use only information supported by the source text. Do not invent content.
PAGE TEXT:
"""${sourceText}"""`;
      const result = await askModel(prompt, { env: aiEnv, timeoutMs: 40000, maxTokens: 900 });
      const match = String(result?.text || "").match(/\{[\s\S]*\}/);
      if (!match) return res.status(502).json({ error: "The AI summary was not valid JSON." });
      let parsed;
      try { parsed = JSON.parse(match[0]); } catch { return res.status(502).json({ error: "The AI summary could not be parsed." }); }
      const summary = String(parsed.summary || "").replace(/\s+/g, " ").trim();
      const terms = (Array.isArray(parsed.terms) ? parsed.terms : []).map((term) => String(term).trim()).filter((term) => term.length >= 3 && term.length <= 40).slice(0, 7);
      if (summary.length < 40 || summary.length > 420 || terms.length < 4 || /\d+\s?(mg|mcg|g)\b/i.test(summary)) return res.status(422).json({ error: "The generated summary did not meet the content checks." });
      return res.status(200).json({ summary, terms });
    }

    if (task === "corpus") {
      const table = String(body.table || "");
      const config = TABLES[table];
      if (!config) return res.status(400).json({ error: "Unsupported corpus table." });
      const limit = Math.max(1, Math.min(100, Number(body.limit) || 50));
      const offset = Math.max(0, Math.min(20000, Number(body.offset) || 0));
      const rows = await getDb().query(
        `SELECT ${config.columns} FROM public.${table} WHERE ${config.where} ORDER BY ${config.order} LIMIT $1 OFFSET $2`,
        [limit, offset],
      );
      return res.status(200).json({ rows });
    }


    if (task === "deep-static") {
      const name = String(body.name || "").slice(0, 180);
      const category = String(body.category || "").slice(0, 100);
      const base = body.base && typeof body.base === "object" ? body.base : null;
      if (name.length < 2 || !base || !Array.isArray(base.sections) || base.sections.length < 3) return res.status(400).json({ error: "A valid topic name and revision page are required." });
      const past = Array.isArray(body.past) ? body.past.slice(0, 12).map(x => String(x).slice(0, 220)) : [];
      const deep = await generateCheckedDeep({ name, category, base, past }, aiEnv, fetch, 240000);
      if (!deepReady(deep) || JSON.stringify(deep).length > 90000) return res.status(422).json({ error: "Deep notes did not pass independent clinical validation." });
      return res.status(200).json({ deep });
    }

    if (task === "check-note") {
      const title = String(body.title || "").slice(0, 240);
      const original = String(body.text || "").slice(0, 18000);
      if (title.length < 2 || original.trim().length < 200) return res.status(400).json({ error: "A note title and at least 200 characters are required." });
      const isThin = value => value.trim().split(/\s+/).filter(Boolean).length < 750 || (value.match(/^#{1,3}\s+/gm) || []).length < 8;
      const applyThin = (result, value) => {
        if (isThin(value)) {
          result.validated = false; result.medium = Number(result.medium || 0) + 1;
          result.issues = [...(result.issues || []), { severity: "medium", where: "overall structure", problem: "This study note is too thin for the comprehensive library standard.", fix: "Expand to at least 8 substantive sections with topic-specific physiology, mechanisms, clinical relevance, investigations, management and pharmacology where relevant." }];
        }
        return result;
      };
      const first = applyThin(await checkContent({ title, kind: "study note", text: original, env: aiEnv, timeoutMs: 45000 }), original);
      let final = first, correctedBody = null, repairStatus = "clean";
      if (!first.validated) {
        const prompt = [
          "You are the medical editor correcting a medical-school learning note for OmpathStudy.",
          "Correct every factual or clinical issue listed below. Preserve every correct original fact, number, unit, drug name, warning, table, diagram, image markdown and link. Do not shorten the note or remove valid teaching content.",
          "Add missing explanations where needed to make the note accurate and understandable. For a thin note, expand it into at least 8 substantive topic-specific sections. Explain relevant physiology, mechanisms, types/classification, clinical features, investigations and interpretation, management, pharmacology, complications and prevention when appropriate.",
          "Use standard accepted medical knowledge only. Never invent statistics, references, local guideline claims or drug doses. If uncertain, qualify or omit. Use British spelling and define specialist terms at first use.",
          "Do not claim a clinician has reviewed the note. Output only the complete corrected Markdown body, without YAML frontmatter or code fences.",
          "NOTE: " + title, "ISSUES:", first.issues.map((x,i)=>(i+1)+". ["+x.severity+"] "+x.where+": "+x.problem+" | Correction: "+x.fix).join("\n"),
          "ORIGINAL NOTE:", original
        ].join("\n\n");
        const draft = await askModel(prompt, { env: aiEnv, timeoutMs: 55000, maxTokens: 10000, plain: true });
        let fixed = String(draft.text || "").replace(/^\x60{3}(?:markdown|md)?\s*/i, "").replace(/\x60{3}\s*$/, "").trim();
        fixed = fixed.replace(/^---[\s\S]*?---\r?\n?/, "");
        if (fixed && fixed.length >= Math.min(500, original.length * 0.65)) {
          final = applyThin(await checkContent({ title, kind: "study note", text: fixed, env: aiEnv, timeoutMs: 45000 }), fixed);
          if (final.validated) { correctedBody = fixed; repairStatus = "auto-repaired"; } else repairStatus = "held";
        } else repairStatus = "held";
      }
      return res.status(200).json({ validated: final.validated, high: final.high, medium: final.medium, issues: final.issues, model: final.model, at: final.at, repairStatus, correctedBody });
    }

    if (task === "review-topic") {
      const slug = String(body.slug || "");
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return res.status(400).json({ error: "Invalid topic slug." });
      const rows = await getDb()`SELECT slug,name,category,content,updated_at,ai_review_status FROM public.topic_pages WHERE slug = ${slug} AND status = 'published' LIMIT 1`;
      const row = rows[0];
      if (!row) return res.status(404).json({ error: "Published topic not found." });
      if (row.ai_review_status === "passed" && row.content?.aiReview?.status === "passed"
          && (row.content?.sections?.length || 0) >= 9 && (row.content?.exam?.length || 0) >= 8
          && (row.content?.faq?.length || 0) >= 3 && JSON.stringify(row.content).split(/\s+/).length >= 700) {
        return res.status(200).json({ status: "existing", slug });
      }
      const prior = row.content || {};
      const context = JSON.stringify({ priorSummary: prior.summary, priorSections: prior.sections, priorExam: prior.exam }).slice(0, 5000);
      const result = await generateReviewedTopicPage({
        name: row.name, category: row.category || "Medicine", context,
        choices: { level: "year4", setting: "tropical", depth: "full", angles: [] },
      }, { env: aiEnv, maxFixRounds: 1, timeoutMs: 55000 });
      if (!result.page?.medical || result.review?.status !== "passed") return res.status(422).json({ status: "held", slug, reason: "independent_review_failed" });
      const page = { ...result.page, aiReview: { ...(result.page.aiReview || {}), status: "passed", model: result.review.model, rounds: result.review.rounds || 0 } };
      if ((page.sections?.length || 0) < 9 || (page.exam?.length || 0) < 8 || (page.faq?.length || 0) < 3
          || String(page.summary || "").length < 100 || JSON.stringify(page).length > 60000) {
        return res.status(422).json({ status: "held", slug, reason: "structure_check_failed" });
      }
      const saved = await getDb()`UPDATE public.topic_pages
        SET content = ${JSON.stringify(page)}::jsonb, model = ${page.model || "groq"},
            reviewed = false, updated_at = now(), generator_model = ${page.model || "groq"},
            ai_review_status = 'passed', ai_review_model = ${String(result.review.model || "gemini")},
            ai_reviewed_at = now(), ai_review_fix_rounds = ${Number(result.review.rounds) || 0}
        WHERE slug = ${slug} AND status = 'published' AND updated_at = ${row.updated_at}
        RETURNING slug`;
      return res.status(200).json({ status: saved.length ? "reviewed" : "conflict", slug });
    }

    if (task === "deep-topic") {
      const slug = String(body.slug || "");
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return res.status(400).json({ error: "Invalid topic slug." });
      const rows = await getDb()`SELECT slug,name,category,content,updated_at FROM public.topic_pages WHERE slug = ${slug} AND status = 'published' LIMIT 1`;
      const row = rows[0];
      if (!row) return res.status(404).json({ error: "Published topic not found." });
      if (deepReady(row.content?.deep)) return res.status(200).json({ status: "existing", slug });
      const deep = await generateCheckedDeep(
        { name: row.name, category: row.category || "Medicine", base: row.content || {}, past: [] },
        aiEnv, fetch, 240000,
      );
      if (!deepReady(deep) || JSON.stringify(deep).length > 90000) return res.status(422).json({ status: "held", slug, reason: "deep_note_validation_failed" });
      const content = { ...(row.content || {}), deep };
      const saved = await getDb()`UPDATE public.topic_pages
        SET content = ${JSON.stringify(content)}::jsonb, updated_at = now()
        WHERE slug = ${slug} AND status = 'published' AND updated_at = ${row.updated_at}
        RETURNING slug`;
      return res.status(200).json({ status: saved.length ? "deep_saved" : "conflict", slug });
    }

    if (task === "review-save") {
      const slug = String(body.slug || "");
      const page = body.page;
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return res.status(400).json({ error: "Invalid topic slug." });
      if (!page || typeof page !== "object" || page.medical !== true || page.aiReview?.status !== "passed"
          || !Array.isArray(page.sections) || page.sections.length < 9 || !Array.isArray(page.exam) || page.exam.length < 8
          || JSON.stringify(page).length > 60000) {
        return res.status(400).json({ error: "Topic review payload did not pass the required structure checks." });
      }
      const saved = await getDb()`UPDATE public.topic_pages
        SET content = ${JSON.stringify(page)}::jsonb,
            model = ${page.model || "groq"},
            reviewed = false,
            updated_at = now(),
            generator_model = ${page.model || "groq"},
            ai_review_status = 'passed',
            ai_review_model = ${String(body.reviewModel || page.aiReview.model || "gemini")},
            ai_reviewed_at = now(),
            ai_review_fix_rounds = ${Number(body.reviewRounds) || 0}
        WHERE slug = ${slug} AND status = 'published' AND updated_at = ${body.updatedAt}
        RETURNING slug`;
      return res.status(200).json({ status: saved.length ? "reviewed" : "conflict", slug });
    }

    if (task === "deep-save") {
      const slug = String(body.slug || "");
      const deep = body.deep;
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return res.status(400).json({ error: "Invalid topic slug." });
      if (!deepReady(deep) || JSON.stringify(deep).length > 90000
          || /https?:|www\.|<[a-z/!]|javascript:|onerror\s*=|data:text/i.test(JSON.stringify(deep))) {
        return res.status(400).json({ error: "Deep-note payload did not pass the required structure checks." });
      }
      const rows = await getDb()`SELECT content FROM public.topic_pages
        WHERE slug = ${slug} AND status = 'published' AND updated_at = ${body.updatedAt} LIMIT 1`;
      const row = rows[0];
      if (!row) return res.status(200).json({ status: "conflict", slug });
      if (deepReady(row.content?.deep)) return res.status(200).json({ status: "existing", slug });
      const content = { ...(row.content || {}), deep };
      const saved = await getDb()`UPDATE public.topic_pages
        SET content = ${JSON.stringify(content)}::jsonb, updated_at = now()
        WHERE slug = ${slug} AND status = 'published' AND updated_at = ${body.updatedAt}
        RETURNING slug`;
      return res.status(200).json({ status: saved.length ? "deep_saved" : "conflict", slug });
    }

    return res.status(400).json({ error: "Unknown maintenance task." });
  } catch (error) {
    console.error("[topic-maintenance]", error instanceof Error ? error.message : String(error));
    return res.status(502).json({ error: "Topic maintenance could not complete this task." });
  }
}
