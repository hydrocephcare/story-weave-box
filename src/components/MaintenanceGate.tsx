import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Loader2, LockKeyhole, LogIn, LogOut, Wrench } from "lucide-react";
import { Helmet } from "react-helmet-async";

const ADMIN_EMAIL = "hydrocephcare@gmail.com";

/**
 * Temporary site-wide maintenance gate.
 * Only the named owner account can enter the application. Login and auth
 * callback routes remain available so the owner can authenticate.
 */
export default function MaintenanceGate({ children }: { children: ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const location = useLocation();
  const authRoute = location.pathname === "/login" || location.pathname === "/auth/callback";
  const authorised = user?.email?.trim().toLowerCase() === ADMIN_EMAIL;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (authorised || authRoute) return <>{children}</>;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-12 text-foreground">
      <Helmet>
        <title>OmpathStudy — Maintenance</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <section className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-card shadow-sm">
          <Wrench className="h-7 w-7 text-primary" />
        </div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">OmpathStudy</p>
        <h1 className="font-serif text-3xl font-bold tracking-tight">We’ll be back shortly</h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          OmpathStudy is temporarily undergoing maintenance. Access is currently restricted while we complete important platform updates.
        </p>
        {user ? (
          <div className="mt-7 rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-medium">Signed in as {user.email}</p>
            <p className="mt-1 text-xs text-muted-foreground">This account is not authorised to access the maintenance environment.</p>
            <Button className="mt-4 w-full" variant="outline" onClick={() => void signOut()}>
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </Button>
          </div>
        ) : (
          <Button asChild className="mt-7">
            <Link to="/login"><LogIn className="mr-2 h-4 w-4" /> Administrator sign in</Link>
          </Button>
        )}
        <div className="mt-8 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <LockKeyhole className="h-3.5 w-3.5" /> Restricted administrator access
        </div>
      </section>
    </main>
  );
}
