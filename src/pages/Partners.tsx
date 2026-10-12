import { useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Building2, GraduationCap, Handshake, Hospital, Mail, MessageCircle, Megaphone, Newspaper, Send } from "lucide-react";

const EMAIL = "ompathstudy@gmail.com";
const WHATSAPP = "254115475543";

const WHO = [
  { icon: GraduationCap, title: "Universities and medical schools", text: "Give your students a free, organised revision library. We can map notes, MCQs and past papers to your course outline, with your name on it." },
  { icon: Building2, title: "Societies and associations", text: "Student societies, medical associations and specialty colleges: share notes and question banks with your members, or run a joint contest." },
  { icon: Newspaper, title: "Publishers and educators", text: "Authors, lecturers and publishers: reach students with your notes, atlases and question banks, with full credit to you." },
  { icon: Hospital, title: "Hospitals, NGOs and health programmes", text: "Training material for interns, nurses and community health teams, in a format that works on a phone." },
  { icon: Megaphone, title: "Sponsors and education brands", text: "Sponsor a contest, a prize or a topic series that medical students use every day." },
];

const OFFER = [
  "Notes, MCQs, flashcards, essays and past papers by year, system and unit",
  "A study assistant that answers from the site's own notes, with links to the source",
  "Contests with leaderboards and certificates",
  "Course outlines with progress tracking, for any programme we add",
  "Works on a phone, installs as an app, and shares as a rich link card",
  "Co-branded pages, sponsored series and private collections, by agreement",
];

const KINDS = ["University / medical school", "Society / association", "Publisher / educator", "Hospital / NGO / programme", "Sponsor / brand", "Other"];

/** /partners: a clear page for organisations that want to work with Ompath Study. The form opens the visitor's own email app, so nothing is stored here. */
export default function Partners() {
  const [kind, setKind] = useState(KINDS[0]);
  const [org, setOrg] = useState("");
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [msg, setMsg] = useState("");

  const subject = `Partnership enquiry: ${org || kind}`;
  const body = `Organisation: ${org}\nType: ${kind}\nContact person: ${name}\nCountry: ${country}\n\n${msg}`;
  const mailto = `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const wa = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(`Partnership enquiry from ${org || "my organisation"} (${kind}). ${msg}`)}`;
  const ready = org.trim().length > 1 && name.trim().length > 1;
  const field = "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
      <Helmet>
        <title>Partner with Ompath Study | Medical education partnerships</title>
        <meta name="description" content="Universities, societies, publishers, hospitals and sponsors: partner with Ompath Study to reach medical students worldwide with notes, MCQs, past papers and contests." />
        <link rel="canonical" href="https://www.ompathstudy.com/partners" />
        <script type="application/ld+json">{JSON.stringify({ "@context": "https://schema.org", "@type": "ContactPage", name: "Partner with Ompath Study", url: "https://www.ompathstudy.com/partners", about: { "@type": "Organization", name: "Ompath Study", url: "https://www.ompathstudy.com", email: EMAIL, contactPoint: { "@type": "ContactPoint", contactType: "partnerships", email: EMAIL, availableLanguage: "English" } } })}</script>
      </Helmet>

      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.2em] text-primary"><Handshake className="h-4 w-4" /> Partnerships</p>
      <h1 className="mt-1 font-serif text-3xl font-bold leading-tight sm:text-5xl">Partner with Ompath Study</h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
        Ompath Study is a free medical study library for students worldwide: notes, MCQs, flashcards, past papers and a study assistant, all in one place and built for phones. If your organisation teaches, trains or supports medical students, we would like to hear from you.
      </p>
      <p className="mt-4 flex flex-wrap gap-3 text-sm font-bold">
        <a href="#enquiry" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-primary-foreground hover:opacity-90"><Send className="h-4 w-4" /> Start a conversation</a>
        <a href={`mailto:${EMAIL}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2.5 hover:border-primary/50"><Mail className="h-4 w-4" /> {EMAIL}</a>
      </p>

      <section className="mt-12" aria-labelledby="who">
        <h2 id="who" className="font-serif text-2xl font-bold">Who we work with</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {WHO.map(({ icon: Icon, title, text }) => (
            <article key={title} className="rounded-2xl border border-border bg-card p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
              <h3 className="mt-3 font-serif text-lg font-bold leading-snug">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12 grid gap-8 lg:grid-cols-2" aria-labelledby="offer">
        <div>
          <h2 id="offer" className="font-serif text-2xl font-bold">What the platform offers</h2>
          <ul className="mt-4 space-y-2.5 text-sm leading-relaxed">
            {OFFER.map((o) => <li key={o} className="flex gap-2.5"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" /><span>{o}</span></li>)}
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">
            See it for yourself: <Link to="/notes" className="font-semibold text-primary hover:underline">study notes</Link>, <Link to="/mcqs" className="font-semibold text-primary hover:underline">MCQs</Link>, <Link to="/course-outlines" className="font-semibold text-primary hover:underline">course outlines</Link>, <Link to="/contests" className="font-semibold text-primary hover:underline">contests</Link>. Logos are in the <Link to="/brand" className="font-semibold text-primary hover:underline">brand kit</Link>.
          </p>
        </div>

        <form id="enquiry" onSubmit={(e) => { e.preventDefault(); if (ready) window.location.href = mailto; }} className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-serif text-xl font-bold">Tell us about your organisation</h2>
          <p className="mt-1 text-xs text-muted-foreground">This opens your email app with the message ready to send to {EMAIL}. Nothing is stored on this page.</p>
          <div className="mt-4 space-y-3">
            <label className="block text-xs font-semibold">Organisation
              <input value={org} onChange={(e) => setOrg(e.target.value)} className={`${field} mt-1`} autoComplete="organization" required />
            </label>
            <label className="block text-xs font-semibold">Type
              <select value={kind} onChange={(e) => setKind(e.target.value)} className={`${field} mt-1`}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold">Your name
                <input value={name} onChange={(e) => setName(e.target.value)} className={`${field} mt-1`} autoComplete="name" required />
              </label>
              <label className="block text-xs font-semibold">Country
                <input value={country} onChange={(e) => setCountry(e.target.value)} className={`${field} mt-1`} autoComplete="country-name" />
              </label>
            </div>
            <label className="block text-xs font-semibold">How would you like to work together?
              <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={4} className={`${field} mt-1`} />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="submit" disabled={!ready} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"><Mail className="h-4 w-4" /> Send by email</button>
            <a href={ready ? wa : undefined} aria-disabled={!ready} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2.5 text-sm font-bold ${ready ? "hover:border-primary/50" : "pointer-events-none opacity-50"}`}><MessageCircle className="h-4 w-4" /> WhatsApp</a>
          </div>
        </form>
      </section>
    </main>
  );
}
