// Who wrote a story. The stories table has no author column, so each story carries a private "owner" tag: a short fingerprint of the
// author's account id (never the id itself). Only the person logged in as that account can produce the same fingerprint, which is what
// lets a student find, edit and delete their own stories.
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";

export async function ownerTagFor(userId: string): Promise<string> {
  try {
    const bytes = new TextEncoder().encode(`ompath-story-owner:${userId}`);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return `owner-${[...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  } catch {
    return "";
  }
}

/** The signed-in student's owner tag, or null for a guest. */
export function useOwnerTag(): string | null {
  const { user } = useAuth();
  const [tag, setTag] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    if (!user) { setTag(null); return; }
    void ownerTagFor(user.id).then((t) => { if (on) setTag(t || null); });
    return () => { on = false; };
  }, [user]);
  return tag;
}

const unescapeHtml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

/** Turns a story the writer produced back into the plain text they typed, so it can be edited. */
export function storyToEditable(html: string): { body: string; html: string; name: string; anonymous: boolean } {
  const by = html.match(/^\s*<p><em>By (.*?)(?: · Year \d)?<\/em><\/p>/i);
  const rest = by ? html.slice(by[0].length) : html;
  const name = by ? unescapeHtml(by[1]).trim() : "";
  const body = unescapeHtml(
    rest.replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, "## $1\n\n").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n"),
  ).trim();
  return { body, html: rest.trim(), name: name === "A medical student" ? "" : name, anonymous: name === "A medical student" };
}
