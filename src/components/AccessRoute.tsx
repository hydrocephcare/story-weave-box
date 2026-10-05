import { useState, type ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { Loader2, Lock, ShieldCheck, MessageCircle } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useStudentAccess } from "@/lib/student";
import registry from "@/data/libraries.json";

function AccessLoader() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export function SignedInRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <AccessLoader />;
  if (!user) {
    const from = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/login?redirect=${encodeURIComponent(from)}`} replace />;
  }

  return <>{children}</>;
}

export function AdminRoute({ children }: { children: ReactNode }) {
  const { user, isAdmin, loading } = useAuth();

  if (loading) return <AccessLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return <>{children}</>;
}

/** What a signed-in, not-yet-verified account sees in place of a student-only page. */
export function StudentGateNotice({ what = "This page" }: { what?: string }) {
  const { status, submitAdmission, refresh } = useStudentAccess();
  const { user } = useAuth();
  const [admission, setAdmission] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!admission.trim()) return;
    setBusy(true); setMessage("");
    const next = await submitAdmission(admission.trim());
    setBusy(false);
    if (next === "unavailable") setMessage("Could not check that right now. Please try again in a minute.");
    else if (next === "pending") setMessage("We could not match that number. Your request has gone to the admin, who will review it.");
  };

  const wa = `https://wa.me/${registry.contactWhatsApp}?text=${encodeURIComponent(`Hello, I am an MKU student and need access to Ompath Study. My account email is ${user?.email ?? ""}.`)}`;

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-5 py-10 text-center">
      <Helmet><meta name="robots" content="noindex" /></Helmet>
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Lock className="h-7 w-7" /></div>
      <h1 className="font-serif text-2xl font-bold text-foreground">For Mount Kenya University students</h1>
      <p className="mt-2 text-sm text-muted-foreground">{what} is only for MKU students.</p>

      {status === "unavailable" && (
        <p className="mt-5 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">Student check is not available right now. Please refresh in a minute.</p>
      )}

      {status === "pending" && (
        <div className="mt-5 w-full rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-foreground">
          <p className="font-semibold">Your request is waiting for the admin.</p>
          <p className="mt-1 text-muted-foreground">We could not match your admission number automatically. You will get access as soon as it is approved.</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={refresh}>Check again</Button>
            <Button asChild size="sm" variant="outline"><a href={wa} target="_blank" rel="noopener noreferrer" className="gap-1.5"><MessageCircle className="h-4 w-4" /> Message the admin</a></Button>
          </div>
        </div>
      )}

      {status === "denied" && (
        <div className="mt-5 w-full rounded-xl border border-border bg-card p-4 text-sm">
          <p className="font-semibold text-foreground">Access was not approved.</p>
          <p className="mt-1 text-muted-foreground">If you are an MKU student, message the admin and they will look at it again.</p>
          <Button asChild size="sm" variant="outline" className="mt-3"><a href={wa} target="_blank" rel="noopener noreferrer" className="gap-1.5"><MessageCircle className="h-4 w-4" /> Message the admin</a></Button>
        </div>
      )}

      {(status === "none" || status === "pending") && (
        <form onSubmit={send} className="mt-6 w-full text-left">
          <label htmlFor="admission" className="mb-1 block text-xs font-medium text-foreground">{status === "pending" ? "Try your admission number again" : "Your MKU admission number"}</label>
          <Input id="admission" value={admission} onChange={(e) => setAdmission(e.target.value)} autoComplete="off" placeholder="Admission number" className="mb-3" required />
          <Button type="submit" className="w-full gap-2" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Continue
          </Button>
          {message && <p className="mt-3 text-center text-xs text-muted-foreground" role="status">{message}</p>}
        </form>
      )}
      <Link to="/" className="mt-6 text-xs text-muted-foreground hover:underline">← Back to home</Link>
    </div>
  );
}

/** Pages only verified Mount Kenya University students (and the admin) can open. */
export function StudentRoute({ children, what }: { children: ReactNode; what?: string }) {
  const { user, loading } = useAuth();
  const { status, loading: checking } = useStudentAccess();
  const location = useLocation();

  if (loading || checking) return <AccessLoader />;
  if (!user) {
    const from = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/login?redirect=${encodeURIComponent(from)}&mku=1`} replace />;
  }
  if (status !== "verified") return <StudentGateNotice what={what} />;
  return <>{children}</>;
}
