import { LogIn, Check } from "lucide-react";
import { Link } from "react-router-dom";

/** Shown to someone who is not logged in. Ompath AI is free to try, but it needs an account so chats follow you and the free allowance stays fair. */
export default function LoginCard({ question, onNavigate }: { question?: string; onNavigate?: () => void }) {
  const back = question ? `/ai?q=${encodeURIComponent(question)}` : "/ai";
  return (
    <section className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card p-4" aria-label="Log in to use Ompath AI">
      <p className="flex items-center gap-2 font-serif text-base font-bold"><LogIn className="h-4 w-4 text-primary" /> Log in to use Ompath AI</p>
      <p className="mt-1 text-sm text-muted-foreground">It is free to start. An account keeps your chats and saved answers on every device, and keeps the daily allowance fair for everyone.</p>
      <ul className="mt-3 space-y-1.5 text-sm">
        {["Notes, past papers and your timetable", "Anatomy spot questions with pictures", "Your chats saved to your account"].map((t) => <li key={t} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{t}</li>)}
      </ul>
      <Link to={`/login?redirect=${encodeURIComponent(back)}`} onClick={onNavigate} className="mt-4 flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-sm">Log in or sign up</Link>
      <p className="mt-2 text-center text-xs text-muted-foreground">You will come straight back here{question ? " with your question" : ""}.</p>
    </section>
  );
}
