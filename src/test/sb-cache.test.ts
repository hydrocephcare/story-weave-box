import { describe, expect, it, vi } from "vitest";
import { makeCachedFetch } from "@/lib/sbCache";

const BASE = "https://x.supabase.co", KEY = "sb_publishable_test";
const ok = () => new Response("[]", { status: 200 });

describe("public read cache", () => {
  it("sends anonymous public reads through the edge cache and merges identical requests", async () => {
    const real = vi.fn(async (_input?: RequestInfo | URL, _init?: RequestInit) => ok());
    const f = makeCachedFetch(BASE, KEY, real as unknown as typeof fetch);
    const u = `${BASE}/rest/v1/articles?select=id,title&published=eq.true`;
    await Promise.all([f(u, { headers: { apikey: KEY, authorization: `Bearer ${KEY}` } }), f(u, { headers: { apikey: KEY } })]);
    expect(real).toHaveBeenCalledTimes(1);
    expect(String(real.mock.calls[0][0])).toContain("workers.dev/?u=");
  });
  it("sends signed-in users, writes, unusual headers and other tables straight to Supabase", async () => {
    const real = vi.fn(async (_input?: RequestInfo | URL, _init?: RequestInit) => ok());
    const f = makeCachedFetch(BASE, KEY, real as unknown as typeof fetch);
    await f(`${BASE}/rest/v1/articles?select=id`, { headers: { authorization: "Bearer a.user.jwt" } });
    await f(`${BASE}/rest/v1/articles?select=id`, { method: "POST", headers: {} });
    await f(`${BASE}/rest/v1/articles?select=id`, { headers: { prefer: "return=representation" } });
    await f(`${BASE}/rest/v1/user_roles?select=*`, { headers: {} });
    await f(`${BASE}/auth/v1/user`, { headers: {} });
    expect(real.mock.calls.map((c) => String(c[0])).every((x) => x.startsWith(BASE))).toBe(true);
    expect(real).toHaveBeenCalledTimes(5);
  });
  it("caches paged and counted reads too, and the new public tables", async () => {
    const real = vi.fn(async (_input?: RequestInfo | URL, _init?: RequestInit) => ok());
    const f = makeCachedFetch(BASE, KEY, real as unknown as typeof fetch);
    await f(`${BASE}/rest/v1/articles?select=id`, { headers: { prefer: "count=exact", range: "0-9" } });
    await f(`${BASE}/rest/v1/paper_answers?select=answer`, { headers: {} });
    expect(real.mock.calls.every((c) => String(c[0]).includes("workers.dev/?u="))).toBe(true);
    expect(String(real.mock.calls[0][0])).toContain("&rg=0-9&pf=count=exact");
  });
  it("falls back to Supabase when the cache is down", async () => {
    const real = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => (String(input).includes("workers.dev") ? new Response("x", { status: 502 }) : ok()));
    const f = makeCachedFetch(BASE, KEY, real as unknown as typeof fetch);
    const r = await f(`${BASE}/rest/v1/mcq_sets?select=id`, { headers: {} });
    expect(r.status).toBe(200);
    expect(real.mock.calls.some((c) => String(c[0]).startsWith(BASE))).toBe(true);
  });
});
