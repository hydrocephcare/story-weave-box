import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowRight, Mail, MessageCircle, ShieldCheck } from "lucide-react";
import { STATIC_NOTES } from "@/data/staticNotes";
import HeroAurora from "@/components/HeroAurora";

const SITE = "https://www.ompathstudy.com";
const EMAIL = "ompathstudy@gmail.com";
const WHATSAPP = "254115475543";

function Shell({ title, description, path, eyebrow, heading, lead, hue = "Medicine", children }: { title: string; description: string; path: string; eyebrow: string; heading: string; lead: string; hue?: string; children: React.ReactNode }) {
  return (
    <main className="pb-20">
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={`${SITE}${path}`} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={`${SITE}${path}`} />
        <meta property="og:image" content={`${SITE}/og-default.png`} />
      </Helmet>
      <header className="relative isolate overflow-hidden">
        <HeroAurora about={hue} />
        <div className="mx-auto max-w-3xl px-5 pb-12 pt-10 sm:pb-16 sm:pt-16">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
          <h1 className="mt-2 font-serif text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl">{heading}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-foreground/75 sm:text-xl">{lead}</p>
        </div>
      </header>
      <div className="mx-auto max-w-2xl px-5 pt-10 text-[17px] leading-[1.8] text-foreground/85 sm:text-[18px]">{children}</div>
    </main>
  );
}
const H2 = ({ children }: { children: React.ReactNode }) => <h2 className="mt-14 font-serif text-3xl font-bold text-foreground first:mt-0">{children}</h2>;
const Dots = ({ items }: { items: string[] }) => (
  <ul className="mt-4 space-y-3">{items.map((t) => <li key={t} className="flex gap-3"><span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />{t}</li>)}</ul>
);

export function AboutUs() {
  const notes = STATIC_NOTES.filter((n) => !n.paper).length;
  const papers = STATIC_NOTES.filter((n) => n.paper).length;
  return (
    <Shell title="About Ompath Study | Free medical notes, past papers and MCQs" description="Ompath Study is a free place to study medicine: notes, past papers, MCQs, flashcards and a page on every topic, organised by year and unit." path="/about-us" eyebrow="About Ompath Study" heading="One place for your medical notes" lead="Notes, past papers, questions and a page on every topic, sorted by year and unit, so you spend your time studying and not searching.">
      <H2>What it is</H2>
      <p className="mt-4">Ompath Study is a free study site for medical students. It started as a student's own collection of notes and grew from there. Everything is organised the way a course is: by year, by unit, by topic.</p>

      <H2>What you can do here</H2>
      <Dots items={[
        "Read study notes for each year and unit, and answer the practice questions at the end.",
        "Look up any disease, structure or process on its own topic page.",
        "Attempt past papers and question banks, with the answers explained.",
        "Make flashcards from any page and review them each day.",
        "Ask Ompath AI when something does not make sense.",
      ]} />

      <H2>What is on the site today</H2>
      <p className="mt-4">About <strong>{notes}</strong> study notes, <strong>{papers}</strong> past papers and question banks, plus MCQ sets, essays, flashcards and more than a thousand topic pages, across Years 1 to 6. New things appear under <Link to="/new-notes" className="font-semibold text-primary hover:underline">Recently added</Link>.</p>

      <H2>How the pages are made</H2>
      <p className="mt-4">Notes come from lectures, standard textbooks and past papers, rewritten into short, clear pages with questions after them. Topic pages draw on the same notes. Every picture is credited to its author. Pages are checked and corrected as readers and lecturers send in mistakes.</p>

      <H2>Please remember</H2>
      <p className="mt-4">This is a study aid, not medical advice. It does not replace your lecturers, your textbooks or a doctor. If you think you or someone else may be unwell, see a doctor or go to the nearest hospital.</p>

      <div className="mt-12 flex flex-wrap gap-3">
        <Link to="/topics" className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 text-[15px] font-bold text-primary-foreground">Browse topics <ArrowRight className="h-4 w-4" aria-hidden /></Link>
        <Link to="/about" className="inline-flex h-12 items-center rounded-full border border-border px-6 text-[15px] font-bold hover:border-primary/60">Behind the site</Link>
        <Link to="/contact" className="inline-flex h-12 items-center rounded-full border border-border px-6 text-[15px] font-bold hover:border-primary/60">Contact</Link>
      </div>
    </Shell>
  );
}

export function Contact() {
  const row = "group flex items-start gap-4 py-4";
  const ico = "mt-1 h-5 w-5 shrink-0 text-primary";
  return (
    <Shell title="Contact Ompath Study" description="Send feedback, report a mistake, or share notes with Ompath Study." path="/contact" eyebrow="Contact" heading="Write to us" lead="Found a mistake, want to share notes, or have an idea? Send it. Corrections are fixed quickly." hue="Obstetrics & gynaecology">
      <a href={`mailto:${EMAIL}`} className={row}><Mail className={ico} aria-hidden /><span><span className="block font-serif text-2xl font-bold group-hover:text-primary">Email</span><span className="block text-foreground/75">{EMAIL}</span><span className="block text-sm text-muted-foreground">Feedback, corrections and notes to share.</span></span></a>
      <a href={`https://wa.me/${WHATSAPP}`} target="_blank" rel="noopener noreferrer" className={row}><MessageCircle className={ico} aria-hidden /><span><span className="block font-serif text-2xl font-bold group-hover:text-primary">WhatsApp</span><span className="block text-foreground/75">Message me directly</span><span className="block text-sm text-muted-foreground">Quick questions and help with your account.</span></span></a>
      <a href={`mailto:${EMAIL}?subject=${encodeURIComponent("Correction")}`} className={row}><ShieldCheck className={ico} aria-hidden /><span><span className="block font-serif text-2xl font-bold group-hover:text-primary">Report a mistake</span><span className="block text-foreground/75">Tell me the page and what is wrong</span><span className="block text-sm text-muted-foreground">Every page also has a "Report an issue" button.</span></span></a>

      <H2>Sending notes</H2>
      <p className="mt-4">Lecture notes, slides and past papers help everyone. Email or WhatsApp them with the unit, the year and the lecturer, and say whether you would like a credit. Only share material you are allowed to share.</p>
      <p className="mt-6"><Link to="/partners" className="inline-flex items-center gap-1.5 font-bold text-primary hover:underline">Universities, societies and publishers <ArrowRight className="h-4 w-4" aria-hidden /></Link></p>
    </Shell>
  );
}

export function Privacy() {
  return (
    <Shell title="Privacy, terms and medical disclaimer | Ompath Study" description="How Ompath Study handles your data, the terms of use and the medical disclaimer." path="/privacy" eyebrow="Legal" heading="Privacy, terms and disclaimer" lead="Plain words about your data, how to use the site, and what it is not." hue="Public health">
      <H2>Medical disclaimer</H2>
      <p className="mt-4">Everything on Ompath Study is for education. It is not medical advice, a diagnosis or a treatment plan, and it does not replace a doctor, a lecturer's teaching or your hospital's guidelines. Drug names and treatment outlines are given for learning, never as a prescription, and doses are left out on purpose. If you think you or someone you know may have a medical condition, see a doctor or health worker. In an emergency, go to the nearest hospital.</p>
      <H2>What I collect</H2>
      <p className="mt-4">If you create an account I keep your email address, your name if you give it, your year of study and your study progress (notes read, quiz results, saved items). Your device also remembers small things, such as text size, recently viewed topics, your flashcards and your daily streak, so the site is faster and your cards stay with you. You can read most of the site without an account.</p>
      <H2>What I do with it</H2>
      <p className="mt-4">I use it to run your account, save your progress and improve the site. I do not sell your personal data. I may count anonymous page visits to see which material helps most. When you use Ompath AI, your question and matching passages from the site are sent to an AI service so it can answer, so please do not type personal details into a question.</p>
      <H2>Your choices</H2>
      <p className="mt-4">You can ask me to delete your account and data at any time by emailing <a className="font-semibold text-primary hover:underline" href={`mailto:${EMAIL}`}>{EMAIL}</a>. You can also clear the site's saved data from your browser settings.</p>
      <H2>Using the site</H2>
      <p className="mt-4">The material is free for personal study. Please do not copy and resell it, or upload anything you do not have the right to share. Notes and past papers are put together from teaching material and standard references. If you own something here and want it credited or removed, write to me and I will act promptly. Pictures are used under their free licences and credited to their authors. I try hard to be accurate, but mistakes happen: check important facts against your textbook and your lecturers, and tell me when you find one.</p>
      <H2>Contact</H2>
      <p className="mt-4">Questions about any of this: <a className="font-semibold text-primary hover:underline" href={`mailto:${EMAIL}`}>{EMAIL}</a>, or the <Link to="/contact" className="font-semibold text-primary hover:underline">contact page</Link>.</p>
    </Shell>
  );
}
