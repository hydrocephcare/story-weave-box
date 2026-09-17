import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Strip WordPress block HTML to clean markdown
function wpToMarkdown(html: string): string {
  let md = html;
  // Remove WP block comments
  md = md.replace(/<!--\s*\/?wp:[^>]*-->\s*/g, "");
  // Convert headings
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1");
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1");
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1");
  md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, "#### $1");
  md = md.replace(/<h5[^>]*>(.*?)<\/h5>/gi, "##### $1");
  // Bold and italic
  md = md.replace(/<strong>(.*?)<\/strong>/gi, "**$1**");
  md = md.replace(/<em>(.*?)<\/em>/gi, "*$1*");
  md = md.replace(/<b>(.*?)<\/b>/gi, "**$1**");
  md = md.replace(/<i>(.*?)<\/i>/gi, "*$1*");
  // Links
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)");
  // List items
  md = md.replace(/<li>([\s\S]*?)<\/li>/gi, "- $1");
  // Remove list wrappers
  md = md.replace(/<\/?[uo]l[^>]*>/gi, "");
  // Paragraphs
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "$1\n\n");
  // Horizontal rules
  md = md.replace(/<hr[^>]*\/?>/gi, "\n---\n");
  // Tables
  md = md.replace(/<table[^>]*>/gi, "\n");
  md = md.replace(/<\/table>/gi, "\n");
  md = md.replace(/<thead[^>]*>/gi, "");
  md = md.replace(/<\/thead>/gi, "");
  md = md.replace(/<tbody[^>]*>/gi, "");
  md = md.replace(/<\/tbody>/gi, "");
  md = md.replace(/<tr[^>]*>([\s\S]*?)<\/tr>/gi, (_, row) => {
    const cells = row.match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi) || [];
    const cleaned = cells.map((c: string) => c.replace(/<\/?t[hd][^>]*>/gi, "").trim());
    return "| " + cleaned.join(" | ") + " |";
  });
  // Remove figure/figcaption/embed wrappers
  md = md.replace(/<figure[^>]*>[\s\S]*?<\/figure>/gi, "");
  md = md.replace(/<div[^>]*>[\s\S]*?<\/div>/gi, "");
  // Remove remaining HTML tags
  md = md.replace(/<[^>]+>/g, "");
  // Decode HTML entities
  md = md.replace(/&amp;/g, "&");
  md = md.replace(/&lt;/g, "<");
  md = md.replace(/&gt;/g, ">");
  md = md.replace(/&quot;/g, '"');
  md = md.replace(/&#039;/g, "'");
  md = md.replace(/&nbsp;/g, " ");
  // Clean up excessive newlines
  md = md.replace(/\n{4,}/g, "\n\n\n");
  return md.trim();
}

// Classify content type based on content analysis
function classifyContent(title: string, content: string): "article" | "mcq" | "story" {
  const lower = content.toLowerCase();
  const titleLower = title.toLowerCase();
  
  // MCQ detection: has multiple choice patterns
  const mcqPatterns = [
    /\ba\)\s/i, /\bb\)\s/i, /\bc\)\s/i, /\bd\)\s/i,
    /\be\)\s/i,
    /ANSWER:\s*\([a-e]\)/i,
    /correct\s*answer/i,
    /SECTION\s*A:\s*MULTIPLE\s*CHOICE/i,
    /multiple\s*choice\s*question/i,
  ];
  const mcqScore = mcqPatterns.filter(p => p.test(content)).length;
  if (mcqScore >= 3) return "mcq";
  
  // Story detection
  const storyPatterns = [
    /once upon a time/i, /story/i, /narrative/i,
    /fiction/i, /short story/i, /tale/i,
    /chapter \d/i,
  ];
  const storyScore = storyPatterns.filter(p => p.test(titleLower) || p.test(lower.slice(0, 500))).length;
  if (storyScore >= 2) return "story";
  if (titleLower.includes("story") || titleLower.includes("tale") || titleLower.includes("narrative")) return "story";
  
  return "article";
}

// Simple category inference from title/content
function inferCategory(title: string, content: string): string {
  const text = (title + " " + content.slice(0, 2000)).toLowerCase();
  
  const categoryMap: Record<string, string[]> = {
    "Hematopathology": ["hematology", "hemato", "blood", "anemia", "leukemia", "lymphoma", "coagulation", "thrombocyt", "erythrocyt", "platelet", "hemoglobin", "hematopoie"],
    "Endocrine and Metabolic Pathology": ["endocrine", "hormone", "thyroid", "adrenal", "pituitary", "diabetes", "insulin", "metabolic", "hypothalamus", "parathyroid", "glucagon"],
    "Chemical Pathology": ["chemical pathology", "clinical chemistry", "biochemistry", "electrolyte", "enzyme", "lipid profile", "liver function", "renal function"],
    "Respiratory System Pathology": ["respiratory", "lung", "pulmonary", "pneumonia", "bronch", "asthma", "copd", "tuberculosis", "pleural"],
    "Gastrointestinal Pathology": ["gastrointestinal", "gastro", "intestin", "hepat", "liver", "pancrea", "stomach", "esophag", "colon", "bowel", "celiac", "crohn"],
    "Female Reproductive System Pathology": ["ovarian", "uterine", "cervical", "breast", "endometri", "gynecol", "pregnancy", "placenta", "ovary", "uterus"],
    "Cardiovascular System Pathology": ["cardiovascular", "cardiac", "heart", "myocard", "atheroscler", "hypertension", "arrhythmia", "valve", "aorta", "coronary"],
    "Basic Pharmacology II": ["pharmacology", "drug", "pharmacokinetic", "pharmacodynamic", "receptor", "dosage", "adverse effect", "mechanism of action"],
    "Research Methodology and Proposal Writing": ["research", "methodology", "proposal", "study design", "hypothesis", "sampling", "statistical", "literature review"],
    "Junior Clerkship/Practicals in General Pathology I": ["clerkship", "practical", "general pathology", "inflammation", "neoplasia", "necrosis", "apoptosis", "wound healing"],
  };
  
  // Check for microbiology content
  if (text.includes("microbiology") || text.includes("bacteria") || text.includes("virus") || 
      text.includes("parasite") || text.includes("fungal") || text.includes("antimicrobial") ||
      text.includes("infection") || text.includes("pathogen")) {
    return "Microbiology";
  }
  
  for (const [category, keywords] of Object.entries(categoryMap)) {
    const matches = keywords.filter(kw => text.includes(kw)).length;
    if (matches >= 2) return category;
  }
  
  // Check for anatomy content
  if (text.includes("anatomy") || text.includes("muscle") || text.includes("nerve") || text.includes("bone")) {
    return "Anatomy";
  }
  
  // Check for physiology
  if (text.includes("physiology") || text.includes("homeostasis") || text.includes("membrane potential")) {
    return "Physiology";
  }
  
  return "Uncategorized";
}

// Parse MCQs from content
function parseMcqs(content: string): any[] {
  const questions: any[] = [];
  
  // Pattern: Question text followed by options a) b) c) d) e) and ANSWER line
  const questionBlocks = content.split(/(?=(?:Question\s*\d+|\*\*Question\s*\d+|#{1,3}\s*\*?\*?Question\s*\d+))/i);
  
  for (const block of questionBlocks) {
    const questionMatch = block.match(/(?:Question\s*\d+\*?\*?\s*)\n+([\s\S]*?)(?=\n\s*(?:a\)|A\)))/i);
    if (!questionMatch) continue;
    
    const questionText = questionMatch[1].replace(/\*\*/g, "").trim();
    if (!questionText) continue;
    
    const optionMatches = block.match(/(?:^|\n)\s*([a-e])\)\s*(.*?)(?=\n\s*[a-e]\)|\n\s*\*?\*?ANSWER|\n\s*\*?\*?EXPLANATION|$)/gis);
    if (!optionMatches || optionMatches.length < 4) continue;
    
    const options = optionMatches.slice(0, 5).map(o => o.replace(/^\s*[a-e]\)\s*/i, "").trim());
    
    const answerMatch = block.match(/ANSWER:\s*\(([a-e])\)\s*(.*?)(?:\n|$)/i);
    let correctAnswer = 0;
    if (answerMatch) {
      correctAnswer = answerMatch[1].toLowerCase().charCodeAt(0) - 97;
    }
    
    const explanationMatch = block.match(/EXPLANATION:\s*([\s\S]*?)(?=\n---|\n#{1,3}\s|\n\*\*Question|$)/i);
    const explanation = explanationMatch ? explanationMatch[1].trim() : undefined;
    
    questions.push({
      question: questionText,
      options: options.slice(0, options.length > 4 ? 5 : 4),
      correct_answer: Math.min(correctAnswer, options.length - 1),
      explanation,
    });
  }
  
  return questions;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const { posts, action } = await req.json();

    if (action === "import") {
      const results = { articles: 0, mcqs: 0, stories: 0, skipped: 0, errors: [] as string[] };

      for (const post of posts) {
        try {
          const title = (post.Title || "").trim();
          const rawContent = post.Content || "";
          
          if (!title || !rawContent || rawContent.length < 50) {
            results.skipped++;
            continue;
          }

          const markdown = wpToMarkdown(rawContent);
          if (markdown.length < 30) {
            results.skipped++;
            continue;
          }

          const contentType = classifyContent(title, rawContent);
          const category = inferCategory(title, rawContent);

          if (contentType === "mcq") {
            const questions = parseMcqs(markdown);
            if (questions.length < 2) {
              // Not enough valid MCQs, save as article instead
              const { error } = await sb.from("articles").insert({
                title,
                content: markdown,
                original_notes: markdown.slice(0, 500),
                category,
                published: true,
                is_raw: false,
              });
              if (error) throw error;
              results.articles++;
            } else {
              const { error } = await sb.from("mcq_sets").insert({
                title: `MCQ: ${title}`,
                questions,
                original_notes: markdown.slice(0, 500),
                category,
                published: true,
                access_password: "",
                is_raw: false,
              });
              if (error) throw error;
              results.mcqs++;
            }
          } else if (contentType === "story") {
            const { error } = await sb.from("stories").insert({
              title,
              content: markdown,
              category,
              published: true,
            });
            if (error) throw error;
            results.stories++;
          } else {
            const { error } = await sb.from("articles").insert({
              title,
              content: markdown,
              original_notes: markdown.slice(0, 500),
              category,
              published: true,
              is_raw: false,
            });
            if (error) throw error;
            results.articles++;
          }
        } catch (err: any) {
          results.errors.push(`"${post.Title?.slice(0, 40)}": ${err.message}`);
        }
      }

      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Unknown action");
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
