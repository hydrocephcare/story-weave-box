import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);
const unsafe = [
  {
    id: "5c815f8a-1046-4fca-bb3c-f5873435d072",
    reason: "Systemic endocrine answer-key errors and ambiguous single-best-answer items",
  },
];

for (const item of unsafe) {
  const { data, error } = await db.from("articles").update({
    published: false,
    requires_review: true,
    completeness_status: "requires_review",
    updated_at: new Date().toISOString(),
  }).eq("id", item.id).select("id,title,slug,published,requires_review,completeness_status").single();
  if (error) throw error;
  console.log(JSON.stringify({ ...data, reason: item.reason }, null, 2));
}
