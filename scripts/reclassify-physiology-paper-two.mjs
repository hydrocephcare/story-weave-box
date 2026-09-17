import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const ARTICLE_ID = "dc37816b-ad0c-416e-8d86-de4515b81e48";
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);

const { data: row, error: readError } = await db
  .from("articles")
  .select("id,title,tags")
  .eq("id", ARTICLE_ID)
  .single();
if (readError) throw readError;

const tags = [...new Set([
  ...(Array.isArray(row.tags) ? row.tags : []).filter((tag) => !/^mcq bank$/i.test(String(tag))),
  "Past Paper",
  "Model Answers",
])];

const title = "Medical Physiology Year Two Paper Two — Past Paper & Model Answers";
const { data, error } = await db.from("articles").update({
  title,
  content_kind: "past_paper",
  exam_type: "Past Paper",
  tags,
  meta_title: "Medical Physiology Year 2 Paper 2 | Questions & Model Answers",
  meta_description: "Revise Medical Physiology Year 2 Paper 2 with structured short-answer and essay questions, complete model answers, and mark-focused explanations.",
  updated_at: new Date().toISOString(),
}).eq("id", ARTICLE_ID).select("id,title,slug,content_kind,exam_type,tags").single();
if (error) throw error;

console.log(JSON.stringify(data, null, 2));
