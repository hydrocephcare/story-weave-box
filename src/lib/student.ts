import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Whether the signed-in account belongs to a verified Mount Kenya University student.
 * The admission number is checked on the server (see supabase/migrations/20261005120000_mku_student_access.sql),
 * so nothing here knows what a valid number looks like.
 *   verified    can open books, timetables, outlines, the library and past papers
 *   pending     the number did not match; the admin has been told and will decide
 *   denied      the admin said no
 *   none        signed in but has not given an admission number yet (for example after Google sign-in)
 *   unavailable the check could not run (network, or the database is not set up yet)
 */
export type StudentStatus = "verified" | "pending" | "denied" | "none" | "unavailable";

const EVENT = "ompath:student-status";
const cache = new Map<string, StudentStatus>();

// The generated database types do not list these functions yet, so call them untyped.
const rpc = (name: string, args?: Record<string, unknown>) =>
  (supabase as unknown as { rpc: (n: string, a?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> }).rpc(name, args);

async function fetchStatus(): Promise<StudentStatus> {
  try {
    const { data, error } = await rpc("my_student_status");
    if (error) return "unavailable";
    return data === "verified" || data === "pending" || data === "denied" ? data : "none";
  } catch {
    return "unavailable";
  }
}

export function useStudentAccess() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const uid = user?.id ?? null;
  const [status, setStatus] = useState<StudentStatus | null>(() => (uid ? cache.get(uid) ?? null : null));
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const again = () => setVersion((v) => v + 1);
    window.addEventListener(EVENT, again);
    return () => window.removeEventListener(EVENT, again);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!uid) { setStatus("none"); return; }
    if (isAdmin) { setStatus("verified"); return; }
    let on = true;
    const known = cache.get(uid);
    if (known) setStatus(known);
    void fetchStatus().then((s) => {
      if (!on) return;
      // A temporary failure must not undo a status we already know.
      const next = s === "unavailable" && known ? known : s;
      if (next !== "unavailable") cache.set(uid, next);
      setStatus(next);
    });
    return () => { on = false; };
  }, [uid, isAdmin, authLoading, version]);

  /** Give the admission number once (the sign-up form does this itself). Returns the new status. */
  const submitAdmission = useCallback(async (entered: string): Promise<StudentStatus> => {
    const { data, error } = await rpc("submit_admission", { _entered: entered });
    if (error) return "unavailable";
    const next: StudentStatus = data === "verified" ? "verified" : data === "denied" ? "denied" : "pending";
    if (uid) cache.set(uid, next);
    setStatus(next);
    window.dispatchEvent(new Event(EVENT));
    return next;
  }, [uid]);

  const refresh = useCallback(() => {
    if (uid) cache.delete(uid);
    setVersion((v) => v + 1);
  }, [uid]);

  return {
    status,
    loading: authLoading || status === null,
    isStudent: status === "verified",
    signedIn: Boolean(user),
    submitAdmission,
    refresh,
  };
}
