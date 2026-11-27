import { loadPublishedTopicPages } from "./corpus.mjs";
import { maintenanceRequest } from "./maintenance-client.mjs";

const COUNT = Math.max(1, Math.min(40, Number(process.env.TOPIC_REVIEW_COUNT || process.argv[2] || 40)));
const PARALLEL = Math.max(1, Math.min(3, Number(process.env.TOPIC_REVIEW_PARALLEL || 2)));

const ready = (p) => Boolean(p?.aiReview?.status === "passed") && String(p?.summary || "").length >= 100
  && (p?.sections?.length || 0) >= 9 && (p?.exam?.length || 0) >= 8 && (p?.faq?.length || 0) >= 3
  && JSON.stringify(p).split(/\s+/).length >= 700;

const rows = await loadPublishedTopicPages();
const queue = rows.filter((row) => row.ai_review_status !== "passed" || !ready(row.content)).slice(0, COUNT);
console.log("Published topic pages: " + rows.length + "; sending " + queue.length + " for independent review.");

let next = 0, passed = 0, failed = 0;
async function worker() {
  while (true) {
    const i = next++; if (i >= queue.length) return;
    const row = queue[i];
    try {
      const result = await maintenanceRequest("review-one", { slug: row.slug });
      if (result.status === "reviewed" || result.status === "existing") {
        passed++; console.log("reviewed and upgraded: " + row.name);
      } else {
        failed++; console.error("held for retry: " + row.name + " (" + result.status + ")");
      }
    } catch (error) {
      failed++; console.error("held for retry: " + row.name + ": " + String(error?.message || error).slice(0, 180));
    }
  }
}
await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, worker));
console.log("Neon topic review: " + passed + " passed; " + failed + " held; " + (rows.length - passed) + " remain pending.");
if (failed) process.exitCode = 1;
