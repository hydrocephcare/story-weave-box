import { useState, useEffect } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { LogIn, Loader2, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/hooks/useAuth";
import { canonicalOrigin, safePostLoginPath, signInWithGoogle } from "@/lib/social-auth";
import { supabase } from "@/integrations/supabase/client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [readerPassword, setReaderPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const { user, isAdmin, signIn, signUp, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && user) {
      const redirect = sessionStorage.getItem("post_login_redirect") || (isAdmin ? "/admin" : "/account");
      sessionStorage.removeItem("post_login_redirect");
      navigate(redirect);
    }
  }, [user, isAdmin, authLoading, navigate]);

  const ogUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${location.pathname}${location.search}`
      : location.pathname;
  const title = "Sign In | OmpathStudy Kenya";
  const description =
    "Sign in to OmpathStudy to access your medical education content, subscriptions, and study materials.";
  const keywords =
    "OmpathStudy, login, medical education Kenya, student portal, study notes";

  const google = async () => {
    setBusy(true);
    sessionStorage.setItem("post_login_redirect", safePostLoginPath((location.state as { from?: string } | null)?.from));
    const res = await signInWithGoogle();
    setBusy(false);
    if (res.redirected) return;
    if (res.error) {
      toast({ title: "Google sign-in failed", description: res.error, variant: "destructive" });
      return;
    }
  };

  const emailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        await signUp(email.trim(), readerPassword);
        toast({ title: "Account created", description: "Check your inbox if confirmation is required." });
      } else {
        await signIn(email.trim(), readerPassword);
        toast({ title: "Signed in" });
      }
    } catch (err) {
      toast({
        title: mode === "signup" ? "Could not create the account" : "Could not sign in",
        description: err instanceof Error ? err.message : "",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      toast({ title: "Enter your email first" });
      return;
    }
    setBusy(true);
    const redirectTo = `${canonicalOrigin()}/login`;
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo });
    setBusy(false);
    toast(error
      ? { title: "Could not send reset email", description: error.message, variant: "destructive" }
      : { title: "Reset email sent", description: "Open the link in your inbox to choose a new password." });
  };

  return (
    <div className="flex min-h-[calc(100vh-73px)] items-center justify-center px-6">
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="keywords" content={keywords} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={ogUrl} />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
      </Helmet>
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-border bg-card p-8" style={{ boxShadow: "var(--shadow-elevated)" }}>
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="mb-2 text-center font-serif text-2xl font-bold text-foreground">
            {mode === "signup" ? "Create your account" : "Sign in"}
          </h1>
          <p className="mb-6 text-center text-sm text-muted-foreground">
            Sign in so your subscription and pass code follow your email everywhere.
          </p>

          <Button type="button" onClick={google} disabled={busy} variant="outline" className="mb-4 w-full gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Continue with Google
          </Button>

          <div className="mb-4 flex items-center gap-3 text-[11px] uppercase tracking-wider text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or email <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={emailAuth}>
            <Input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="mb-3" required />
            <Input type="password" placeholder="Password" value={readerPassword} onChange={(e) => setReaderPassword(e.target.value)} className="mb-4" required />
            <Button type="submit" className="w-full gap-2" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              {mode === "signup" ? "Create account" : "Sign in"}
            </Button>
            {mode === "signin" && (
              <Button type="button" variant="link" onClick={resetPassword} disabled={busy} className="mt-2 w-full text-xs">
                Forgot password?
              </Button>
            )}
          </form>

          <button
            type="button"
            onClick={() => setMode((m) => (m === "signup" ? "signin" : "signup"))}
            className="mt-4 w-full text-center text-xs font-semibold text-primary underline underline-offset-4"
          >
            {mode === "signup" ? "I already have an account" : "New here? Create an account"}
          </button>
          <div className="mt-4 text-center">
            <Link to="/" className="text-xs text-muted-foreground hover:underline">← Continue as guest</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
