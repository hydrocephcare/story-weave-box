import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { startAccountSync } from "@/lib/accountSync";

/** Mounted once: while someone is signed in, their habits and progress follow their email. */
export default function AccountSync() {
  const { user, loading } = useAuth();
  useEffect(() => { if (loading || !user) return; return startAccountSync(user.id); }, [user?.id, loading]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
