const endpoint = process.env.TOPIC_MAINTENANCE_URL || "https://www.ompathstudy.com/api/neon-functions?name=topic-maintenance";
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
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ task, ...fields }),
    signal: AbortSignal.timeout(task === "deep-topic" || task === "deep-static" ? 260000 : task === "check-note" ? 180000 : task === "zone-write" ? 180000 : 58000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Topic maintenance API returned HTTP ${response.status}`);
  return result;
}
