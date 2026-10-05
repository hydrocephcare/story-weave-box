import { useState, useEffect } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { LogIn, Loader2, Mail, ShieldCheck, Sparkles, BookOpen, Trophy, Target } from "lucide-react";
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
  const [confirmPassword, setConfirmPassword] = useState("");
  const [admission, setAdmission] = useState("");
  const [sent, setSent] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const { user, isAdmin, signIn, signUp, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && user) {
      const asked = new URLSearchParams(location.search).get("redirect");
      const redirect = (asked && asked.startsWith("/") && !asked.startsWith("//") ? asked : null) || sessionStorage.getItem("post_login_redirect") || (isAdmin ? "/admin" : "/account");
      sessionStorage.removeItem("post_login_redirect");
      navigate(redirect);
    }
  }, [user, isAdmin, authLoading, navigate, location.search]);

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
    const asked = new URLSearchParams(location.search).get("redirect");
    sessionStorage.setItem("post_login_redirect", safePostLoginPath(asked ?? (location.state as { from?: string } | null)?.from));
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
        if (readerPassword !== confirmPassword) {
          toast({ title: "Passwords do not match", description: "Type the same password twice.", variant: "destructive" });
          return;
        }
        await signUp(email.trim(), readerPassword, admission.trim());
        setSent(true);
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
      <div className="grid w-full max-w-6xl items-center gap-12 py-10 lg:grid-cols-2">
        <div className="hidden space-y-6 lg:block">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Your medical study workspace
          </span>
          <h2 className="font-serif text-4xl font-bold leading-tight text-foreground">Read, practise and revise — all in one place.</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">One account keeps your subscription, saved files and study progress with you on every device.</p>
          <div className="grid gap-3">
            {[
              { icon: BookOpen, t: "Notes for Year 1–6", d: "Unit-by-unit study notes, slides and past papers." },
              { icon: Trophy, t: "Timed exams & CATs", d: "Proctored MCQ papers with instant scoring." },
              { icon: Target, t: "Revision that follows you", d: "Streaks, bookmarks and your revision planner stay synced." },
              { icon: ShieldCheck, t: "Your pass, everywhere", d: "Subscription and pass code tied to your email." },
            ].map((p) => (
              <div key={p.t} className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5">
                <div className="shrink-0 rounded-lg bg-primary/10 p-2 text-primary"><p.icon className="h-4 w-4" /></div>
                <div><p className="text-sm font-semibold text-foreground">{p.t}</p><p className="mt-0.5 text-xs text-muted-foreground">{p.d}</p></div>
              </div>
            ))}
          </div>
        </div>
      <div className="mx-auto w-full max-w-md">
        <div className="rounded-2xl border border-border bg-card p-8" style={{ boxShadow: "var(--shadow-elevated)" }}>
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="mb-2 text-center font-serif text-2xl font-bold text-foreground">
            {sent ? "Check your email" : mode === "signup" ? "Create your student account" : "Welcome back"}
          </h1>
          <p className="mb-6 text-center text-sm text-muted-foreground">
            {sent
              ? "We sent a link to confirm your email. Open it, then sign in here. If your admission number could not be matched, the admin will review your request."
              : new URLSearchParams(location.search).get("mku")
                ? "Books, timetables, course outlines and past papers are for Mount Kenya University students. Sign in with your student account."
                : "Sign in so your subscription and pass code follow your email everywhere."}
          </p>
          {sent && (
            <Button type="button" className="w-full" onClick={() => { setSent(false); setMode("signin"); setReaderPassword(""); setConfirmPassword(""); }}>Go to sign in</Button>
          )}

          {!sent && <>
          <Button type="button" onClick={google} disabled={busy} variant="outline" className="mb-4 w-full gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Continue with Google
          </Button>

          <div className="mb-4 flex items-center gap-3 text-[11px] uppercase tracking-wider text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or email <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={emailAuth}>
            <label htmlFor="login-email" className="mb-1 block text-xs font-medium text-foreground">Email</label>
            <Input id="login-email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="mb-3" required />
            {mode === "signup" && (
              <>
                <label htmlFor="login-admission" className="mb-1 block text-xs font-medium text-foreground">MKU admission number</label>
                <Input id="login-admission" type="text" autoComplete="off" placeholder="Your admission number" value={admission} onChange={(e) => setAdmission(e.target.value)} className="mb-3" required />
              </>
            )}
            <label htmlFor="login-password" className="mb-1 block text-xs font-medium text-foreground">Password</label>
            <Input id="login-password" type="password" placeholder="Password" value={readerPassword} onChange={(e) => setReaderPassword(e.target.value)} className="mb-3" minLength={mode === "signup" ? 8 : undefined} required />
            {mode === "signup" && (
              <>
                <label htmlFor="login-confirm" className="mb-1 block text-xs font-medium text-foreground">Confirm password</label>
                <Input id="login-confirm" type="password" placeholder="Type the password again" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="mb-4" minLength={8} required />
              </>
            )}
            {mode === "signin" && <div className="mb-1" />}
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
          {mode === "signup" && <p className="mt-3 text-center text-[11px] text-muted-foreground">Signing up with Google instead? You will be asked for your admission number once.</p>}
          </>}
          <div className="mt-4 text-center">
            <Link to="/" className="text-xs text-muted-foreground hover:underline">← Continue as guest</Link>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
