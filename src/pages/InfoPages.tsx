import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowRight, BookOpen, FileText, Handshake, HeartPulse, Layers, Mail, MessageCircle, ShieldCheck } from "lucide-react";
import { STATIC_NOTES } from "@/data/staticNotes";

const SITE = "https://www.ompathstudy.com";
const EMAIL = "ompathstudy@gmail.com";
const WHATSAPP = "254115475543";

function Shell({ title, description, path, eyebrow, heading, lead, children }: { title: string; description: string; path: string; eyebrow: string; heading: string; lead: string; children: React.ReactNode }) {
  return (
    <main className="pb-16">
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={`${SITE}${path}`} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={`${SITE}${path}`} />
        <meta property="og:image" content={`${SITE}/og-default.png`} />
      </Helmet>
      <header className="border-b border-border bg-gradient-to-br from-primary/[0.12] via-background to-background">
        <div className="mx-auto max-w-4xl px-5 pb-10 pt-10 sm:pb-14 sm:pt-14">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
          <h1 className="mt-2 font-serif text-4xl font-bold leading-tight tracking-tight sm:text-6xl">{heading}</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-foreground/75 sm:text-xl">{lead}</p>
        </div>
      </header>
      <div className="mx-auto max-w-4xl px-5 pt-10 text-[17px] leading-[1.8] text-foreground/85">{children}</div>
    </main>
  );
}
const H2 = ({ children }: { children: React.ReactNode }) => <h2 className="mt-12 font-serif text-2xl font-bold text-foreground first:mt-0 sm:text-3xl">{children}</h2>;

export function AboutUs() {
  const notes = STATIC_NOTES.filter((n) => !n.paper).length;
  const papers = STATIC_NOTES.filter((n) => n.paper).length;
  const cards = [
    { Icon: BookOpen, t: "Notes by year and unit", d: "Study notes for the whole MBChB, organised by year, system and unit, with course outlines and progress tracking." },
    { Icon: FileText, t: "Past papers and MCQs", d: "Past papers, CATs and question banks with answers and explanations, free to attempt in timed exams." },
    { Icon: Layers, t: "A page on every topic", d: "Look up any disease, structure or process: a clear overview, causes, tests, management, pictures and practice questions." },
    { Icon: HeartPulse, t: "Clinical thinking", d: "Notes written the way a clinician reasons: what is it, how bad, what causes it, which test answers which question, and what to do." },
  ];
  return (
    <Shell title="About Ompath Study | Free medical notes, past papers and MCQs" description="Ompath Study is a free library of medical study notes, past papers, MCQs and topic pages for students worldwide, organised by year, system and unit." path="/about-us" eyebrow="About us" heading="A free medical library, built by students" lead="Ompath Study puts notes, past papers, MCQs and a page on every topic in one place, so revision starts with one tap instead of a long search.">
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map(({ Icon, t, d }) => (
          <div key={t} className="rounded-2xl border border-border bg-card p-5"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" aria-hidden /></span><h3 className="mt-3 font-serif text-xl font-bold text-foreground">{t}</h3><p className="mt-1.5 text-[15.5px] leading-relaxed text-muted-foreground">{d}</p></div>
        ))}
      </div>
      <H2>What is on the site</H2>
      <p>Today the library holds <strong>{notes}+ study notes</strong>, <strong>{papers}+ past papers and question banks</strong>, MCQ sets, essays, flashcards and more than a thousand topic pages, across Years 1 to 6. New material is added every week, and the newest items are always listed under <Link to="/new-notes" className="font-semibold text-primary hover:underline">Recently added</Link>.</p>
      <H2>How the notes are made</H2>
      <p>Notes are compiled from lectures, standard textbooks and past papers, then rewritten into clear, exam-ready pages with tables, worked examples and practice questions. Topic pages combine our notes with standard references and pictures from Wikipedia and Wikimedia Commons, which are credited. Every page is a study aid and is refined as students and lecturers send corrections.</p>
      <H2>Who it is for</H2>
      <p>Medical students and anyone learning health sciences, in any country. The library began with one university's syllabus and now serves learners worldwide. Course outlines are available for several programmes and more are added on request.</p>
      <H2>An honest note</H2>
      <p>Ompath Study is for learning. It is not medical advice and must never replace a doctor, a lecturer or a hospital guideline. If you think you or someone else may be unwell, see a doctor or go to the nearest hospital.</p>
      <div className="mt-10 flex flex-wrap gap-3">
        <Link to="/topics" className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-base font-bold text-primary-foreground">Browse topics <ArrowRight className="h-4 w-4" aria-hidden /></Link>
        <Link to="/partners" className="inline-flex items-center gap-2 rounded-full border border-border px-6 py-3 text-base font-bold hover:border-primary/60"><Handshake className="h-4 w-4" aria-hidden /> Partner with us</Link>
        <Link to="/contact" className="inline-flex items-center gap-2 rounded-full border border-border px-6 py-3 text-base font-bold hover:border-primary/60">Contact us</Link>
      </div>
    </Shell>
  );
}

export function Contact() {
  const card = "flex items-start gap-4 rounded-2xl border border-border bg-card p-5 transition hover:border-primary/60";
  return (
    <Shell title="Contact Ompath Study" description="Contact Ompath Study: send feedback, report a mistake, share notes, or ask about partnerships." path="/contact" eyebrow="Contact" heading="We read every message" lead="Found a mistake, want to share notes, or have an idea? Write to us. Corrections are fixed quickly.">
      <div className="grid gap-4 sm:grid-cols-2">
        <a href={`mailto:${EMAIL}`} className={card}><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Mail className="h-5 w-5" aria-hidden /></span><span><span className="block font-serif text-xl font-bold text-foreground">Email</span><span className="mt-0.5 block text-[15.5px] text-muted-foreground">{EMAIL}</span><span className="mt-1 block text-sm text-muted-foreground">Feedback, corrections, notes to share.</span></span></a>
        <a href={`https://wa.me/${WHATSAPP}`} target="_blank" rel="noopener noreferrer" className={card}><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><MessageCircle className="h-5 w-5" aria-hidden /></span><span><span className="block font-serif text-xl font-bold text-foreground">WhatsApp</span><span className="mt-0.5 block text-[15.5px] text-muted-foreground">Message us directly</span><span className="mt-1 block text-sm text-muted-foreground">Quick questions and access help.</span></span></a>
        <Link to="/partners" className={card}><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Handshake className="h-5 w-5" aria-hidden /></span><span><span className="block font-serif text-xl font-bold text-foreground">Partnerships</span><span className="mt-0.5 block text-[15.5px] text-muted-foreground">Universities, societies, publishers, sponsors</span><span className="mt-1 block text-sm text-primary">See how we can work together</span></span></Link>
        <a href={`mailto:${EMAIL}?subject=${encodeURIComponent("Correction")}`} className={card}><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><ShieldCheck className="h-5 w-5" aria-hidden /></span><span><span className="block font-serif text-xl font-bold text-foreground">Report a mistake</span><span className="mt-0.5 block text-[15.5px] text-muted-foreground">Tell us the page and what is wrong</span><span className="mt-1 block text-sm text-muted-foreground">Every page also has a "Report an issue" button.</span></span></a>
      </div>
      <H2>Sending notes</H2>
      <p>Lecture notes, slides and past papers help the whole library. Email or WhatsApp them with the unit, year and lecturer, and say if you want a credit. We only publish material you are allowed to share.</p>
    </Shell>
  );
}

export function Privacy() {
  return (
    <Shell title="Privacy, terms and medical disclaimer | Ompath Study" description="How Ompath Study handles your data, the terms of use and the medical disclaimer." path="/privacy" eyebrow="Legal" heading="Privacy, terms and disclaimer" lead="Plain words about your data, how to use the site, and what it is not.">
      <H2>Medical disclaimer</H2>
      <p>Everything on Ompath Study is for education. It is not medical advice, a diagnosis or a treatment plan, and it does not replace a doctor, a lecturer's teaching or your hospital's guidelines. Drug names and treatment outlines are given for learning, never as a prescription, and doses are deliberately left out. If you think you or someone you know may have a medical condition, see a doctor or health worker. In an emergency, go to the nearest hospital.</p>
      <H2>What we collect</H2>
      <p>If you create an account we keep your email address, your name if you give it, your year of study and your study progress (notes read, quiz results, saved items). Your device also remembers small preferences, such as text size, recently viewed topics and a cached copy of pictures, so the site is faster. You can read most of the site without an account.</p>
      <H2>What we do with it</H2>
      <p>We use it to run your account, save your progress, and improve the site. We do not sell your personal data. We may count anonymous page visits to see which material helps most. Ompath AI sends your question and matching passages from the site to an AI service so it can answer; avoid typing personal details into any question.</p>
      <H2>Your choices</H2>
      <p>You can ask us to delete your account and data at any time by emailing <a className="font-semibold text-primary hover:underline" href={`mailto:${EMAIL}`}>{EMAIL}</a>. You can also clear the site's saved data from your browser settings.</p>
      <H2>Using the site</H2>
      <p>The material is provided free for personal study. Please do not copy and resell it, or upload content you do not have the right to share. Notes and past papers are compiled from teaching material and standard references; if you own something here and want it credited or removed, write to us and we will act promptly. Pictures from Wikipedia and Wikimedia Commons are used under their free licences and credited. We work hard to be accurate, but errors can occur: always check important facts against your textbook and lecturers, and tell us when you spot a mistake.</p>
      <H2>Contact</H2>
      <p>Questions about any of this: <a className="font-semibold text-primary hover:underline" href={`mailto:${EMAIL}`}>{EMAIL}</a>, or use the <Link to="/contact" className="font-semibold text-primary hover:underline">contact page</Link>.</p>
    </Shell>
  );
}
