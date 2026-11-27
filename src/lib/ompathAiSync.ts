// Sync signed-in Ompath AI chats through the authenticated Neon API.
// Chat history remains local if account sync is temporarily unavailable.
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { aiStore, useAiStore } from "@/lib/ompathAiStore";

async function accessToken(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

export function useAiAccountSync(userId: string | null) {
  const { sessions } = useAiStore();
  const ready = useRef<string | null>(null);

  // Load the account copy before enabling writes, so a fresh device never overwrites saved chats.
  useEffect(() => {
    ready.current = null;
    if (!userId) return;
    let active = true;
    (async () => {
      const token = await accessToken();
      if (!token) return;
      try {
        const response = await fetch("/api/ai-history", {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!response.ok) return;
        const result = await response.json();
        if (!active) return;
        const data = result?.data;
        if (data && typeof data === "object") {
          aiStore.mergeRemote(
            Array.isArray(data.sessions) ? data.sessions : [],
            Array.isArray(data.deleted) ? data.deleted : [],
          );
        }
        ready.current = userId;
      } catch {
        // Local chat history remains available when remote sync is offline.
      }
    })();
    return () => { active = false; };
  }, [userId]);

  // Save after changes, using a server-verified Neon identity rather than direct table access.
  useEffect(() => {
    if (!userId || ready.current !== userId) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        const payload = aiStore.exportForSync();
        if (!payload.sessions.length && !payload.deleted.length) return;
        const token = await accessToken();
        if (!token) return;
        try {
          await fetch("/api/ai-history", {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ data: payload }),
          });
        } catch {
          // Never interrupt an AI conversation because history sync failed.
        }
      })();
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [userId, sessions]);
}
