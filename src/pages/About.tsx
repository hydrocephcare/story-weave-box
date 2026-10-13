import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowRight, Mail, MessageCircle } from "lucide-react";
import portrait from "@/assets/abongo-davis-portrait.jpg";
import HeroAurora from "@/components/HeroAurora";

const SITE = "https://www.ompathstudy.com";
const EMAIL = "ompathstudy@gmail.com";
const WHATSAPP = "254115475543";
const TITLE = "About me | Ompath Study";
const DESC = "I am Abongo Davis, a medical student. I started Ompath Study because my own notes were scattered, and I wanted one place for them.";

/** /about: the student behind the site. Short, plain, and only about this site. */
export default function About() {
  const person = { "@context": "https://schema.org", "@type": "Person", name: "Abongo Davis", jobTitle: "Medical student", url: `${SITE}/about`, worksFor: { "@type": "Organization", name: "Ompath Study", url: SITE } };
  return (
    <main className="pb-20">
      <Helmet>
        <title>{TITLE}</title>
        <meta name="description" content={DESC} />
        <link rel="canonical" href={`${SITE}/about`} />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESC} />
        <meta property="og:url" content={`${SITE}/about`} />
        <meta property="og:image" content={`${SITE}/og-default.png`} />
        <script type="application/ld+json">{JSON.stringify(person)}</script>
      </Helmet>

      <header className="relative isolate overflow-hidden">
        <HeroAurora about="Psychiatry" />
        <div className="mx-auto grid max-w-4xl items-center gap-8 px-5 pb-12 pt-10 sm:grid-cols-[minmax(0,1fr)_14rem] sm:pb-16 sm:pt-16">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">About me</p>
            <h1 className="mt-2 font-serif text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl">Hi, I'm Abongo.</h1>
            <p className="mt-5 max-w-xl text-xl leading-relaxed text-foreground/80">I'm a medical student. I made Ompath Study for myself first, and then for anyone else who studies the way I do.</p>
          </div>
          <img src={portrait} alt="Abongo Davis" width={224} height={224} loading="eager" className="h-44 w-44 rounded-full object-cover shadow-lg ring-4 ring-background sm:h-56 sm:w-56 sm:justify-self-end" />
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-5 pt-10 text-[18px] leading-[1.8] text-foreground/85">
        <h2 className="font-serif text-3xl font-bold text-foreground">Why this site exists</h2>
        <div className="mt-4 space-y-4">
          <p>In medical school the notes are everywhere. Some are in lecture slides, some in a chat group, some in a photo of a past paper, some on a friend's phone. Before an exam I spent more time finding things than reading them.</p>
          <p>So I started putting them in one place, sorted by year and unit, with the questions next to the notes and the answers explained. Then I shared it with my classmates. Then more people asked for it. That is the whole story.</p>
        </div>

        <h2 className="mt-14 font-serif text-3xl font-bold text-foreground">What you will find here</h2>
        <ul className="mt-4 space-y-3">
          {["Study notes for each year and unit, with practice questions at the end.", "A page on every topic, with pictures, tests and questions.", "Past papers and question banks, with the answers explained.", "Flashcards, a daily review, and Ompath AI to ask when you are stuck."].map((t) => (
            <li key={t} className="flex gap-3"><span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />{t}</li>
          ))}
        </ul>

        <h2 className="mt-14 font-serif text-3xl font-bold text-foreground">Please check it</h2>
        <p className="mt-4">I am a student, not a doctor, and I make mistakes. Everything here is for learning, and your lecturers' notes and your textbooks come first. If you find something wrong or out of date, tell me and I will fix it. It helps everyone who reads after you.</p>

        <h2 className="mt-14 font-serif text-3xl font-bold text-foreground">How you can help</h2>
        <ul className="mt-4 space-y-3">
          {["Report a mistake. Every page has a button for it.", "Send a note, a paper or a question bank you would like others to have.", "Tell a classmate about the site."].map((t) => (
            <li key={t} className="flex gap-3"><span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />{t}</li>
          ))}
        </ul>

        <h2 className="mt-14 font-serif text-3xl font-bold text-foreground">Write to me</h2>
        <div className="mt-5 flex flex-wrap gap-3">
          <a href={`mailto:${EMAIL}`} className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 text-[15px] font-bold text-primary-foreground"><Mail className="h-4 w-4" aria-hidden /> {EMAIL}</a>
          <a href={`https://wa.me/${WHATSAPP}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 items-center gap-2 rounded-full border border-border px-6 text-[15px] font-bold hover:border-primary/60"><MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp</a>
        </div>
        <p className="mt-10"><Link to="/about-us" className="inline-flex items-center gap-1.5 font-bold text-primary hover:underline">About Ompath Study <ArrowRight className="h-4 w-4" aria-hidden /></Link></p>
      </div>
    </main>
  );
}
