// Keeps a signed-in student's Ompath AI chats on their account. Needs supabase/migrations/20261008130000_ompath_ai_history_sync.sql;
// without it everything here quietly does nothing and chats stay on the device.
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { aiStore, useAiStore } from "@/lib/ompathAiStore";

const db = supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export function useAiAccountSync(userId: string | null) {
  const { sessions } = useAiStore();
  const ready = useRef<string | null>(null);

  // 1. when a student signs in, bring their saved chats in
  useEffect(() => {
    ready.current = null;
    if (!userId) return;
    let on = true;
    (async () => {
      try {
        const { data, error } = await db.from("ai_user_history").select("data").eq("user_id", userId).maybeSingle();
        if (!on) return;
        if (!error && data?.data) aiStore.mergeRemote(Array.isArray(data.data.sessions) ? data.data.sessions : [], Array.isArray(data.data.deleted) ? data.data.deleted : []);
        if (!error) ready.current = userId; // only start saving once the account copy has been read, so it is never overwritten blind
      } catch { /* table not set up, or offline */ }
    })();
    return () => { on = false; };
  }, [userId]);

  // 2. a few seconds after anything changes, save the chats to the account
  useEffect(() => {
    if (!userId || ready.current !== userId) return;
    const t = window.setTimeout(() => {
      const payload = aiStore.exportForSync();
      void db.from("ai_user_history").upsert({ user_id: userId, data: payload, updated_at: new Date().toISOString() }).then(() => undefined, () => undefined);
    }, 4000);
    return () => window.clearTimeout(t);
  }, [userId, sessions]);
}
