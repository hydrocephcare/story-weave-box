import { supabase } from "@/integrations/supabase/client";

export interface ChatMeta { id: string; title: string; updated_at: string }
const db = supabase as any;
const LOCAL = "ompath_admin_chats_v1";

// Saved on the server (agent_chats, one set per administrator). If that table is not installed yet it falls back to this browser, so history never silently vanishes.
type Local = Record<string, { title: string; feed: unknown[]; updated_at: string }>;
const readLocal = (): Local => { try { return JSON.parse(localStorage.getItem(LOCAL) || "{}"); } catch { return {}; } };
const writeLocal = (v: Local) => { try { localStorage.setItem(LOCAL, JSON.stringify(v)); } catch { /* storage full or blocked */ } };
const newId = () => (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export async function listChats(): Promise<{ chats: ChatMeta[]; where: "server" | "browser" }> {
  const r = await db.from("agent_chats").select("id,title,updated_at").order("updated_at", { ascending: false }).limit(40);
  if (!r.error) return { chats: r.data || [], where: "server" };
  const l = readLocal();
  return { chats: Object.entries(l).map(([id, v]) => ({ id, title: v.title, updated_at: v.updated_at })).sort((a, b) => b.updated_at.localeCompare(a.updated_at)), where: "browser" };
}

export async function loadChat(id: string): Promise<unknown[]> {
  const r = await db.from("agent_chats").select("feed").eq("id", id).maybeSingle();
  if (!r.error && r.data) return Array.isArray(r.data.feed) ? r.data.feed : [];
  return readLocal()[id]?.feed ?? [];
}

export async function saveChat(id: string | null, title: string, feed: unknown[]): Promise<string> {
  const trimmed = feed.slice(-150);
  const { data: u } = await supabase.auth.getUser();
  const owner = u.user?.id;
  if (owner) {
    if (id && !id.includes("-local")) {
      const up = await db.from("agent_chats").update({ title, feed: trimmed, updated_at: new Date().toISOString() }).eq("id", id).select("id");
      if (!up.error && up.data?.length) return id;
    }
    const ins = await db.from("agent_chats").insert({ owner, title, feed: trimmed }).select("id").single();
    if (!ins.error && ins.data?.id) return ins.data.id as string;
  }
  const l = readLocal(); const key = id ?? `${newId()}-local`;
  l[key] = { title, feed: trimmed, updated_at: new Date().toISOString() }; writeLocal(l);
  return key;
}

export async function deleteChat(id: string) {
  const r = await db.from("agent_chats").delete().eq("id", id);
  if (r.error) { const l = readLocal(); delete l[id]; writeLocal(l); }
}
