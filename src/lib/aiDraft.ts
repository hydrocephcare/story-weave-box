// A good Ompath AI answer for a search the site had no notes for goes to the admin as a draft to approve. Nothing is published from here.
const SENT = "ompath_drafts_sent";
export function offerDraft(query: string, answer: string, year: number | null) {
  try {
    const sent: string[] = JSON.parse(sessionStorage.getItem(SENT) ?? "[]");
    const k = query.trim().toLowerCase();
    if (sent.includes(k) || sent.length >= 5) return;
    sessionStorage.setItem(SENT, JSON.stringify([...sent, k]));
    void fetch("/api/ai?task=draft", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, answer, year }), keepalive: true }).catch(() => undefined);
  } catch { /* never in the way of the answer */ }
}
