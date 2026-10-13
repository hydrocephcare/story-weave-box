import { Link } from "react-router-dom";
import { Mic, BarChart3, CalendarCheck, HeartPulse, Wallet, LayoutDashboard } from "lucide-react";

const TOOLS = [
  { to: "/admin/analytics", icon: BarChart3, title: "Visitors", text: "Who is on the site now, how many used it each day, each week and each year, and a picture of the numbers to share on WhatsApp." },
  { to: "/topics", icon: Mic, title: "Record your voice", text: "Open any note, blog or topic page, tap the small settings icon beside Listen, and record. Everyone who taps Listen on that page then hears you." },
  { to: "/admin/outline-sync", icon: CalendarCheck, title: "Course outline sync", text: "Paste a course outline: every matching note, blog and topic shows its year, semester, week and lecturer." },
  { to: "/admin/content-health", icon: HeartPulse, title: "Content health", text: "Every blog checked for thin pages, scan noise, bad titles and weak question banks, with one-tap fixes." },
  { to: "/admin/monetise", icon: Wallet, title: "Monetise", text: "Ads, a sponsor line and book links. All off until you switch them on." },
  { to: "/admin", icon: LayoutDashboard, title: "The rest of the admin", text: "Notes, MCQs, flashcards, categories, payments and settings." },
];

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
    </main>
  );
}
