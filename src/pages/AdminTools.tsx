import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, CalendarCheck, HeartPulse, Wallet, LayoutDashboard } from "lucide-react";

const TOOLS = [
  { to: "/admin/analytics", icon: BarChart3, title: "Visitors", text: "Who is on the site now, how many used it each day, each week and each year, and a picture of the numbers to share on WhatsApp." },
  { to: "/admin/outline-sync", icon: CalendarCheck, title: "Course outline sync", text: "Paste a course outline: every matching note, blog and topic shows its year, semester, week and lecturer." },
  { to: "/admin/polish", icon: HeartPulse, title: "Polished blogs", text: "Each Year 1 to 3 blog gets a clear title, description and tidy text the first time it is opened. Weak and irrelevant pages are listed here to hide or keep." },
  { to: "/admin/content-health", icon: HeartPulse, title: "Content health", text: "Every blog checked for thin pages, scan noise, bad titles and weak question banks, with one-tap fixes." },
  { to: "/admin/monetise", icon: Wallet, title: "Monetise", text: "Ads, a sponsor line and book links. All off until you switch them on." },
  { to: "/admin", icon: LayoutDashboard, title: "The rest of the admin", text: "Notes, MCQs, flashcards, categories, payments and settings." },
];

function SetPassword() {
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const save = async () => {
    if (pw.length < 8) { setMsg("Use at least 8 characters."); return; }
    const { error } = await supabase.auth.updateUser({ password: pw });
    setMsg(error ? error.message : "Password saved. You can now sign in with it, and use it for the voice script.");
    if (!error) setPw("");
  };
  return (
    <section className="mt-12" aria-label="Set password">
      <h2 className="font-serif text-2xl font-bold">Set a password</h2>
      <p className="mt-1 text-[16px] text-muted-foreground">For signing in with a password, and for the voice script on your computer.</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" placeholder="New password" className="h-12 min-w-0 flex-1 rounded-full border border-border bg-background px-5" />
        <button type="button" onClick={save} className="h-12 rounded-full bg-primary px-6 font-bold text-primary-foreground">Save</button>
      </div>
      {msg && <p className="mt-2 text-sm text-muted-foreground" role="status">{msg}</p>}
    </section>
  );
}

/** /admin/tools: one page that leads to the admin tools. */
export default function AdminTools() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Admin</p>
      <h1 className="mt-1 font-serif text-4xl font-bold">Tools</h1>
      <ul className="mt-8 space-y-7">
        {TOOLS.map((t) => (
          <li key={t.to}><Link to={t.to} className="group flex items-start gap-4"><t.icon className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden /><span><span className="block font-serif text-2xl font-bold group-hover:text-primary">{t.title}</span><span className="mt-1 block text-[16px] leading-relaxed text-muted-foreground">{t.text}</span></span></Link></li>
        ))}
      </ul>
      <SetPassword />
    </main>
  );
}
