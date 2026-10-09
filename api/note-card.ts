import { ImageResponse } from "@vercel/og";
import { noteCardTree } from "../src/lib/noteCard";

export const config = { runtime: "edge" };

/** /api/note-card?title=…&year=4&unit=…&kind=Notes&week=Week 3 — the share picture for a note that has no picture of its own. */
export default function handler(req: Request): Response {
  const q = new URL(req.url).searchParams;
  const tree = noteCardTree({ title: q.get("title") ?? "", year: q.get("year"), unit: q.get("unit"), kind: q.get("kind"), week: q.get("week") });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = new ImageResponse(tree as any, { width: 1200, height: 630 });
  res.headers.set("Cache-Control", "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400");
  return res;
}
