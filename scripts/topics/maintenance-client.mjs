import { postJsonPreservingRedirect } from "../../supabase/functions/_shared/postJson.js";

const configuredEndpoint = String(process.env.TOPIC_MAINTENANCE_URL || "").trim();
const workflowBranch = process.env.GITHUB_REF_NAME || "main";
const endpoint = configuredEndpoint || (workflowBranch === "main" ? "https://www.ompathstudy.com/api/neon-functions?name=topic-maintenance" : "");
if (!endpoint) throw new Error("Set TOPIC_MAINTENANCE_URL to an isolated staging endpoint before running this workflow outside main.");
const audience = "ompathstudy-topic-maintenance";

async function getWorkflowToken() {
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!requestUrl || !requestToken) throw new Error("GitHub Actions OIDC token access is not enabled for this job.");
  const url = new URL(requestUrl);
  url.searchParams.set("audience", audience);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${requestToken}` } });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.value) throw new Error("Could not obtain a GitHub Actions OIDC token.");
  return result.value;
}

export async function maintenanceRequest(task, fields = {}) {
  const token = await getWorkflowToken();
  const timeoutMs = task === "deep-topic" || task === "deep-static" ? 260000 : task === "check-note" || task === "zone-write" || task === "note-mcqs" || task === "note-flashcards" ? 180000 : 58000;
  const { response, data: result, finalUrl, redirects } = await postJsonPreservingRedirect(
    endpoint,
    { task, ...fields },
    { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    timeoutMs,
  );
  if (!response.ok) throw new Error(result.error || `Topic maintenance API returned HTTP ${response.status} at ${finalUrl} after ${redirects} redirects`);
  return result;
}
