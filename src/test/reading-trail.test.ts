import { beforeEach, describe, expect, it, vi } from "vitest";

const rows: Record<string, any[]> = {
  user_resource_progress: [],
  articles: [],
};
const upserts: any[] = [];
vi.mock("@/integrations/supabase/client", () => {
  const chain = (table: string) => {
    const q: any = {
      select: () => q, eq: () => q, in: () => q, order: () => q, limit: () => Promise.resolve({ data: rows[table] }),
      upsert: (v: any) => { upserts.push({ table, v }); return Promise.resolve({ error: null }); },
      maybeSingle: () => Promise.resolve({ data: null }),
      then: (res: any) => res({ data: rows[table] }),
    };
    return q;
  };
  return { supabase: { from: (t: string) => chain(t) } };
});

import { loadReadIds, loadTrail, saveNotePosition, syncTrailToAccount, trackNoteOpen } from "@/lib/readingTrail";

beforeEach(() => { localStorage.clear(); upserts.length = 0; rows.user_resource_progress = []; rows.articles = []; });

describe("reading trail", () => {
  it("remembers a note on this device and in the account when signed in", async () => {
    await trackNoteOpen("u1", { id: "n1", title: "Normal Growth", category: "Year 4: Paediatrics" });
    expect(upserts.some((u) => u.table === "user_resource_progress" && u.v.resource_id === "n1" && u.v.user_id === "u1")).toBe(true);
    const t = await loadTrail(null);
    expect(t[0].id).toBe("n1");
  });

  it("a guest only keeps it locally", async () => {
    await trackNoteOpen(null, { id: "n2", title: "Asthma", category: "Year 4: Internal Medicine" });
    expect(upserts.length).toBe(0);
    expect((await loadTrail(null))[0].title).toBe("Asthma");
  });

  it("saves how far the reader got and counts 80% or more as read", async () => {
    await saveNotePosition("u1", "n3", 0.9);
    expect(upserts.at(-1).v.progress_percent).toBe(90);
    expect((await loadReadIds(null)).has("n3")).toBe(true);
    await saveNotePosition(null, "n4", 0.3);
    expect((await loadReadIds(null)).has("n4")).toBe(false);
  });

  it("merges what the account remembers (another device) with this device", async () => {
    await trackNoteOpen(null, { id: "local1", title: "Local note", category: "Year 4: X" });
    rows.user_resource_progress = [{ resource_id: "phone1", status: "in_progress", progress_percent: 42, last_opened_at: new Date(Date.now() + 1000).toISOString() }];
    rows.articles = [{ id: "phone1", title: "Read on the phone", slug: "year-4-x-read-on-the-phone-abc123", category: "Year 4: X" }, { id: "local1", title: "Local note", slug: null, category: "Year 4: X" }];
    const t = await loadTrail("u1");
    expect(t.map((i) => i.id)).toEqual(["phone1", "local1"]);
    expect(t[0].at).toBeCloseTo(0.42, 2);
    expect(t[0].done).toBe(false);
  });

  it("pushes what a guest read into the account after sign-in", async () => {
    await trackNoteOpen(null, { id: "g1", title: "Guest note", category: "Year 4: X" });
    await syncTrailToAccount("u9");
    expect(upserts.at(-1).v[0].user_id).toBe("u9");
  });
});
