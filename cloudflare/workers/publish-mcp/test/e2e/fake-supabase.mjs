// A tiny in-memory stand-in for the parts of Supabase the gateway uses (sign-in, has_role, the articles table), so the whole flow can be tested
// without touching production. Run: node test/e2e/fake-supabase.mjs 9911
import http from "node:http";
import { randomUUID } from "node:crypto";

const SERVICE = "svc-test-key";
const rows = [
  { id: "11111111-1111-4111-8111-111111111111", title: "Acute Abdomen", slug: "year-4-surgery-acute-abdomen", category: "Year 4: Surgery", unit: "Surgery", published: true, deleted_at: null, tags: [], created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
    content: "# Acute Abdomen\n\n## What you must know\n\n- Pain is the key symptom.\n\n## 1. Causes\n\nMany causes.\n\n## 2. Management\n\nResuscitate first.\n\n## Key points to revise\n\n1. Examine the abdomen.\n" },
  { id: "22222222-2222-4222-8222-222222222222", title: "Hernias", slug: "year-4-surgery-hernias", category: "Year 4: Surgery", unit: "Surgery", published: true, deleted_at: null, tags: [], created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", content: "# Hernias\n\n## A\n\nx\n\n## B\n\ny\n\n## Key points to revise\n\n1. z\n" },
];
const log = [];

const send = (res, code, body) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => r(d ? JSON.parse(d) : {})); });

function filter(q) {
  return rows.filter((r) => {
    for (const [k, v] of q.entries()) {
      if (["select", "order", "limit", "offset"].includes(k)) continue;
      if (k === "or") {
        const term = (/ilike\.\*(.*?)\*/.exec(v) ?? [])[1] ?? "";
        const t = decodeURIComponent(term).toLowerCase();
        if (!(r.title.toLowerCase().includes(t) || r.slug.toLowerCase().includes(t.replace(/\s+/g, "-")))) return false;
        continue;
      }
      if (v.startsWith("eq.")) { if (String(r[k]) !== v.slice(3)) return false; continue; }
      if (v === "is.null") { if (r[k] !== null) return false; continue; }
      if (v.startsWith("ilike.")) { if (String(r[k]).toLowerCase() !== decodeURIComponent(v.slice(6)).toLowerCase()) return false; continue; }
    }
    return true;
  });
}
const project = (r, select) => { if (!select) return r; const cols = select.split(","); return Object.fromEntries(cols.filter((c) => c in r).map((c) => [c, r[c]])); };

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  log.push(`${req.method} ${url.pathname}`);
  if (url.pathname === "/__rows") return send(res, 200, rows);
  if (url.pathname === "/__log") return send(res, 200, log);
  if (url.pathname === "/auth/v1/token") {
    const b = await readBody(req);
    if (b.email === "admin@test.local" && b.password === "correct-password") return send(res, 200, { access_token: "jwt-admin", user: { id: "u-admin", email: b.email } });
    if (b.email === "student@test.local" && b.password === "student-pass") return send(res, 200, { access_token: "jwt-student", user: { id: "u-student", email: b.email } });
    return send(res, 400, { error: "invalid_grant" });
  }
  if (url.pathname === "/rest/v1/rpc/has_role") { await readBody(req); return send(res, 200, req.headers.authorization === "Bearer jwt-admin"); }
  const auth = req.headers.authorization === `Bearer ${SERVICE}`;
  if (!auth) return send(res, 401, { message: "bad key" });
  if (url.pathname === "/rest/v1/rpc/category_counts") return send(res, 200, [{ category: "Year 4: Surgery", count: 2 }]);
  if (url.pathname === "/rest/v1/articles") {
    if (req.method === "GET") {
      let out = filter(url.searchParams);
      out = out.slice(0, Number(url.searchParams.get("limit") ?? 100));
      return send(res, 200, out.map((r) => project(r, url.searchParams.get("select"))));
    }
    if (req.method === "POST") {
      const b = await readBody(req);
      const row = { id: randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null, ...b };
      rows.push(row);
      return send(res, 201, [row]);
    }
    if (req.method === "PATCH") {
      const b = await readBody(req);
      const hit = filter(url.searchParams);
      hit.forEach((r) => Object.assign(r, b));
      return send(res, 200, hit);
    }
  }
  send(res, 404, { message: "not found " + url.pathname });
}).listen(Number(process.argv[2] ?? 9911), "127.0.0.1", () => console.log("fake supabase on", process.argv[2] ?? 9911));
