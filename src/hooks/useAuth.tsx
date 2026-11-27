import { useState, useEffect, createContext, useContext, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { syncLocalProgress } from "@/lib/study";
import { syncTrailToAccount } from "@/lib/readingTrail";
import { wipePersonalData } from "@/lib/signOutCleanup";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, admission?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkAdmin = useCallback(async (userId: string, email?: string | null) => {
    // The verified site owner must retain administrator access even when the
    // migrated role table has not yet been reconciled with Neon Auth user IDs.
    if (email?.trim().toLowerCase() === "hydrocephcare@gmail.com") {
      setIsAdmin(true);
      return;
    }
    try {
      const roleRequest = supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
      const timeout = new Promise<{ data: false; error: Error }>((resolve) =>
        window.setTimeout(() => resolve({ data: false, error: new Error("Role check timed out") }), 5000),
      );
      const { data, error } = await Promise.race([roleRequest, timeout]);
      setIsAdmin(!error && Boolean(data));
    } catch {
      setIsAdmin(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let hadUser = false;
    const ensurePromises = new Map<string, Promise<void>>();
    const applySession = async (nextSession: Session | null) => {
      if (!active) return;
      const hadBefore = hadUser;
      hadUser = Boolean(nextSession?.user);
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (nextSession?.user) {
        // The session is sufficient to render the app. Progress syncing is
        // background work and must not delay every page navigation/login.
        await checkAdmin(nextSession.user.id, nextSession.user.email);
        const userId = nextSession.user.id;
        let ready = ensurePromises.get(userId);
        if (!ready) {
          ready = fetch("/api/ensure-user", {
            method: "POST",
            headers: { Authorization: "Bearer " + nextSession.access_token },
            signal: AbortSignal.timeout(12000),
          }).then(async (response) => {
            if (!response.ok) throw new Error("Account data migration could not be completed.");
            const result = await response.json().catch(() => ({}));
            if (result.migration_pending) ensurePromises.delete(userId);
          });
          ensurePromises.set(userId, ready);
          void ready.catch(() => ensurePromises.delete(userId));
        }
        try {
          await ready;
          void syncLocalProgress(userId).catch(() => undefined);
          void syncTrailToAccount(userId).catch(() => undefined);
        } catch (error) {
          console.warn("[auth] Neon account preparation failed:", error);
        }
      }
      else {
        setIsAdmin(false);
        if (hadBefore) wipePersonalData(); // signed out (here, in another tab, or the session ended): leave nothing of the student behind
      }
      if (active) setLoading(false);
    };

    // Keep this callback synchronous. Awaiting a backend request here can hold
    // the auth client's session lock and leave the entire app loading forever.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setLoading(true);
      window.setTimeout(() => { void applySession(nextSession); }, 0);
    });

    supabase.auth.getSession()
      .then(({ data }) => applySession(data.session))
      .catch(() => applySession(null));

    return () => { active = false; subscription.unsubscribe(); };
  }, [checkAdmin]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string, admission?: string) => {
    // The admission number rides along as sign-up data; the database checks it the moment the account exists.
    const { error } = await supabase.auth.signUp({ email, password, options: admission ? { data: { admission_no: admission } } : undefined });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setIsAdmin(false);
  };

  return (
    <AuthContext.Provider value={{ user, session, isAdmin, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

const defaultAuth: AuthContextType = {
  user: null,
  session: null,
  isAdmin: false,
  loading: true,
  signIn: async () => { throw new Error("Auth not ready"); },
  signUp: async () => { throw new Error("Auth not ready"); },
  signOut: async () => {},
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  return ctx ?? defaultAuth;
}
