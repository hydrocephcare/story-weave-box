// Makes the AI-written MCQ banks harder to guess. Walks through the banks one at a time (a cursor is kept in app_settings), finds the questions that give their
// answer away (the right option is the longest, a wrong option says "always", the stem is a bare "What is X?"), and rewrites them as scenarios with plausible
// wrong options of the same length. A rewrite replaces the old question only if it still tests the same fact. Banks that lecturers or students uploaded are
// never touched. Called by the schedule (x-cron-key) or by an administrator.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { hardenBatch, isSkippable, weakness } from "../_shared/mcqHarden.js";
import { cleanTopicTitle } from "../_shared/topicTitle.js";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
const KEY0 = "mcq_harden_cursor";
const BATCH = 8;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const cronOk = !!Deno.env.get("CRON_KEY") && req.headers.get("x-cron-key") === Deno.env.get("CRON_KEY");
    if (!cronOk) {
      const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: u } = token ? await supabase.auth.getUser(token) : { data: null };
      const { data: ok } = u?.user ? await supabase.rpc("has_role", { _user_id: u.user.id, _role: "admin" }) : { data: false };
      if (!ok) return json({ error: "Administrators only." }, 403);
    }
    const body = await req.json().catch(() => ({}));
    // two lanes work at once: lane 0 from the first bank onwards, lane 1 from the last bank backwards
    const lane = Number(body?.lane) === 1 ? 1 : 0;
    const KEY = lane ? `${KEY0}_b` : KEY0;
    const { data: cur } = await supabase.from("app_settings").select("id,value").eq("key", KEY).maybeSingle();
    const cursor = body?.set_id ? "" : String(cur?.value || "");
    let q = supabase.from("mcq_sets").select("id,title,category,questions").eq("published", true).is("deleted_at", null).eq("source_type", "note_generated").order("id", { ascending: !lane }).limit(body?.set_id ? 1 : 5);
    q = body?.set_id ? q.eq("id", body.set_id) : cursor ? (lane ? q.lt("id", cursor) : q.gt("id", cursor)) : q;
    const { data: sets, error } = await q;
    if (error) return json({ error: error.message }, 500);
    const saveCursor = async (v: string) => { if (cur?.id) await supabase.from("app_settings").update({ value: v }).eq("id", cur.id); else await supabase.from("app_settings").insert({ key: KEY, value: v }); };
    if (!sets || !sets.length) { await saveCursor(""); return json({ success: true, done: true, status: "cycle finished, starting again" }); }

    for (const set of sets) {
      const qs: any[] = Array.isArray(set.questions) ? set.questions : [];
      const todo: number[] = [];
      qs.forEach((x, i) => { if (!x?.h && !isSkippable(x) && weakness(x).length) todo.push(i); });
      if (!todo.length) { if (!body?.set_id) await saveCursor(set.id); continue; }
      const pick = todo.slice(0, BATCH);
      const subject = `${cleanTopicTitle(set.title).replace(/:?\s*MCQs?$/i, "")} (${String(set.category || "").replace(/^Year\s*\d\s*:\s*/i, "")})`;
      let better: (any | null)[] = [];
      let why = "";
      try { better = await hardenBatch(Deno.env.toObject(), pick.map((i) => qs[i]), { subject, manual: !cronOk }); } catch (e) { why = e instanceof Error ? e.message.slice(0, 160) : String(e); }
      if (why) return json({ success: true, status: "AI busy, will retry", why });
      let changed = 0;
      pick.forEach((i, k) => { const b = better[k]; if (b) { qs[i] = { ...b, h: 1 }; changed++; } else qs[i] = { ...qs[i], h: 2 }; });   // 1 = rewritten, 2 = tried and left as it was
      const { error: upErr } = await supabase.from("mcq_sets").update({ questions: qs }).eq("id", set.id);
      if (upErr) return json({ error: upErr.message }, 500);
      const left = qs.filter((x) => !x?.h && !isSkippable(x) && weakness(x).length).length;
      if (!left && !body?.set_id) await saveCursor(set.id);
      return json({ success: true, set: set.title, weak: todo.length, rewritten: changed, kept: pick.length - changed, left });
    }
    return json({ success: true, status: "nothing weak in these banks" });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
