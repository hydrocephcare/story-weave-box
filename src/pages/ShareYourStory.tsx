import { Link, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { PenLine, Copy, MessageCircle, Sparkles, Share2 } from "lucide-react";
import { useState } from "react";
import { SITE_URL } from "@/lib/seo";
import FinalistBadge from "@/components/FinalistBadge";

/** Who a share page speaks to: everyone, finalists, one year of study, or anyone outside MBChB (nurses, clinical officers, pharmacists, lecturers, parents...). */
export type Who = "everyone" | "finalist" | "other" | `year-${1 | 2 | 3 | 4 | 5 | 6}`;

const PRECLINICAL = ["My first week on campus", "The exam that scared me most, and what helped", "What anatomy and physiology really felt like", "How I study when I do not feel like it", "What I wish someone told me in Year 1"];
const CLINICAL = ["My first day on the wards", "A patient I will never forget", "The rotation that surprised me", "How I balance wards and exams", "What I wish someone told me before clinicals"];

type Page = { path: string; image: string; title: string; description: string; eyebrow: string; heading: string; lead: string; prompts: string[]; link: string; note: string; share: string; wa: string };

function pageFor(who: Who): Page {
  if (who === "finalist") return {
    path: "/finalists", image: "/og/share-story.png?v=2",
    title: "Finalists: tell the MKU students coming behind you | OmpathStudy",
    description: "Finalists and graduates of Mount Kenya University and other Kenyan medical schools: tell the students coming behind you what the wards, exams and years were really like.",
    eyebrow: "Finalists and graduates", heading: "Talk to the students coming behind you",
    lead: "You made it through. The first years, the ones stuck in the anatomy lab, the ones dreading their first ward round: they are reading right now and wondering if it gets easier. Tell them the real version, the way you would in the hostel or the corridor.",
    prompts: ["The exam that almost broke me, and what got me through", "My first day on the wards", "What I wish someone told me in Year 1", "How I studied for finals", "Rotations I loved, and ones I did not"],
    link: "/stories?write=1&year=7", note: "Takes a few minutes. Your name can stay private. Your story will carry the Finalist badge.",
    share: "Pass it on to other finalists", wa: "Finalists, tell the juniors what med school was really like. Write your story here:",
  };
  if (who === "other") return {
    path: "/share-your-story/other", image: "/og/share-story-all.png?v=2",
    title: "Share your story: nursing, clinical medicine, pharmacy, dentistry and beyond | OmpathStudy",
    description: "You do not have to be an MBChB student. Nurses, clinical officers, pharmacists, dental and lab students, lecturers and parents: write your story and let it help someone.",
    eyebrow: "Everyone is welcome", heading: "You do not have to study medicine to have a story",
    lead: "Nursing, clinical medicine, pharmacy, dentistry, lab science, public health, teaching, or watching a child become a doctor: if health and learning are part of your life, your story belongs here. Write it simply and honestly.",
    prompts: ["Why I chose my course", "A day in my training I will never forget", "What nobody warned me about", "How I coped when it got hard", "Advice for someone starting where I started"],
    link: "/stories?write=1&year=8", note: "Takes a few minutes. Your name can stay private. Choose Other as your level.",
    share: "Pass it on", wa: "Everyone has a story, not only medical students. Write yours here:",
  };
  const m = /^year-([1-6])$/.exec(who);
  if (m) {
    const y = Number(m[1]);
    return {
      path: `/share-your-story/year-${y}`, image: "/og/share-story-all.png?v=2",
      title: `Year ${y} students: share your story | OmpathStudy`,
      description: `Year ${y} at medical school: write what it is really like and help the students beside you and behind you. Your name can stay private.`,
      eyebrow: `Year ${y}`, heading: `Year ${y}: what is it really like?`,
      lead: y <= 3
        ? `Year ${y} is its own world. Tell the juniors what to expect, tell your classmates they are not alone, and tell us what no timetable ever shows. Write it the way you would tell a friend in the hostel.`
        : `Year ${y} means wards, patients and long days. Tell the juniors what it is really like, and tell your classmates they are not alone. Write it the way you would tell a friend in the hostel.`,
      prompts: y <= 3 ? PRECLINICAL : CLINICAL,
      link: `/stories?write=1&year=${y}`, note: `Takes a few minutes. Your name can stay private. Your story is marked Year ${y}.`,
      share: `Pass it on to Year ${y}`, wa: `Year ${y}, tell us what it is really like. Write your story here:`,
    };
  }
  return {
    path: "/share-your-story", image: "/og/share-story-all.png?v=2",
    title: "Medical students: share your story | OmpathStudy",
    description: "From first year to finalists: write what medical school has really been like and help the students beside you and behind you. Your name can stay private.",
    eyebrow: "For medical students", heading: "Your story could be someone's best day",
    lead: "Year 1 and lost in anatomy? On the wards for the first time? Resitting a paper and keeping quiet about it? A finalist looking back? Write it the way you would tell a friend in the hostel. Someone out there is going through the same thing and needs to read it. (Studying something else in health? You are welcome too.)",
    prompts: ["My first week on campus", "The exam that scared me most, and what helped", "My first day on the wards", "How I study when I do not feel like it", "What I wish someone told me at the start"],
    link: "/stories?write=1", note: "Takes a few minutes. Your name can stay private. Pick your year or level when you write.",
    share: "Pass it on to your classmates", wa: "Med students, tell the juniors what it is really like. Write your story here:",
  };
}

const CHOICES: { who: Who; label: string }[] = [
  { who: "year-1", label: "Year 1" }, { who: "year-2", label: "Year 2" }, { who: "year-3", label: "Year 3" },
  { who: "year-4", label: "Year 4" }, { who: "year-5", label: "Year 5" }, { who: "year-6", label: "Year 6" },
  { who: "finalist", label: "Finalist" }, { who: "other", label: "Another course" },
];

export const parseWho = (v?: string): Who => (v === "finalist" || v === "finalists" || v === "other" || /^year-[1-6]$/.test(v ?? "") ? (v === "finalists" ? "finalist" : (v as Who)) : "everyone");

export default function ShareYourStory({ audience }: { audience?: Who | "finalists" }) {
  const params = useParams();
  const who = parseWho(audience ?? params.who);
  const c = pageFor(who);
  const url = `${SITE_URL}${c.path}`;
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ } };
  const wa = `https://wa.me/?text=${encodeURIComponent(`${c.wa} ${url}`)}`;
  const finalists = who === "finalist";
  return (
    <main className="mx-auto max-w-xl px-5 py-12 sm:py-16">
      <Helmet>
        <title>{c.title}</title>
        <meta name="description" content={c.description} />
        <link rel="canonical" href={url} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={c.title} />
        <meta property="og:description" content={c.description} />
        <meta property="og:url" content={url} />
        <meta property="og:image" content={`${SITE_URL}${c.image}`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={c.title} />
        <meta name="twitter:description" content={c.description} />
        <meta name="twitter:image" content={`${SITE_URL}${c.image}`} />
      </Helmet>
      <div className="text-center">
        {finalists ? <FinalistBadge className="mx-auto h-16 w-16" /> : <Sparkles className="mx-auto h-12 w-12 text-primary" aria-hidden />}
        <p className="mt-3 text-[11px] font-extrabold uppercase tracking-[0.2em] text-amber-600 dark:text-amber-400">{c.eyebrow}</p>
        <h1 className="mt-2 font-serif text-3xl font-bold leading-tight sm:text-4xl">{c.heading}</h1>
        <p className="mt-4 font-serif text-lg leading-relaxed text-muted-foreground">{c.lead}</p>
      </div>

      <div className="mt-8 flex flex-col items-center gap-3">
        <Link to={c.link} className="inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 text-base font-bold text-primary-foreground shadow-sm">
          <PenLine className="h-5 w-5" /> Write my story
        </Link>
        <p className="text-center text-xs text-muted-foreground">{c.note}</p>
      </div>

      <div className="mt-8 rounded-2xl border border-border bg-card p-5">
        <p className="text-sm font-bold">Not sure where to start? Pick one:</p>
        <ul className="mt-3 space-y-2 text-[15px] text-foreground/80">
          {c.prompts.map((p) => <li key={p} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />{p}</li>)}
        </ul>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground"><Sparkles className="h-3.5 w-3.5 text-primary" /> The writer has an AI helper that fixes spelling and paragraphs and suggests titles. It keeps your words.</p>
      </div>

      <div className="mt-10 rounded-2xl border border-border p-5 text-center">
        <p className="inline-flex items-center gap-1.5 font-semibold"><Share2 className="h-4 w-4 text-primary" /> {c.share}</p>
        <p className="mt-1 break-all text-sm text-muted-foreground">{url}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={copy} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:border-primary">
            <Copy className="h-4 w-4" /> {copied ? "Copied" : "Copy link"}
          </button>
          <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">
            <MessageCircle className="h-4 w-4" /> Send on WhatsApp
          </a>
        </div>
      </div>

      <div className="mt-8 text-center">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Share a link made for</p>
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          {CHOICES.map((o) => <Link key={o.who} to={`/${o.who === "finalist" ? "finalists" : `share-your-story/${o.who}`}`} className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${o.who === who ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/50"}`}>{o.label}</Link>)}
        </div>
      </div>
      <p className="mt-6 text-center text-sm"><Link to="/stories" className="text-primary hover:underline">Read what other students wrote</Link></p>
    </main>
  );
}
