import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/** The name the student set in their account (profiles.display_name), first name only. Empty until it is known, and for visitors who are not signed in. */
export function useDisplayName(): string {
  const { user } = useAuth();
  const [name, setName] = useState("");
  useEffect(() => {
    if (!user) { setName(""); return; }
    let stop = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void (supabase as any).from("profiles").select("display_name").eq("user_id", user.id).maybeSingle().then(({ data }: { data: { display_name?: string } | null }) => {
      if (stop) return;
      const full = String(data?.display_name || (user.user_metadata as { full_name?: string } | undefined)?.full_name || "").trim();
      setName(full.split(/\s+/)[0] || "");
    });
    return () => { stop = true; };
  }, [user]);
  return name;
}
