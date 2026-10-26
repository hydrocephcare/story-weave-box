import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { PenLine, Copy, MessageCircle } from "lucide-react";
import { useState } from "react";
import { SITE_URL } from "@/lib/seo";
import FinalistBadge from "@/components/FinalistBadge";

const URL_ = `${SITE_URL}/share-your-story`;
const TITLE = "Share your med school story: finalists talk to MKU students | OmpathStudy";
const DESC = "Finalists and graduates of Mount Kenya University and other Kenyan medical schools: tell the students coming behind you what the wards, exams and years were really like.";
const PROMPTS = [
  "The exam that almost broke me, and what got me through",
  "My first day on the wards",
  "What I wish someone told me in Year 1",
  "How I studied for finals",
  "Rotations I loved, and ones I did not",
];

export default function ShareYourStory() {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(URL_); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ } };
  const wa = `https://wa.me/?text=${encodeURIComponent(`Finalists, tell the juniors what med school was really like. Write your story here: ${URL_}`)}`;
  return (
    <main className="mx-auto max-w-xl px-5 py-12 sm:py-16">
      <Helmet>
        <title>{TITLE}</title>
        <meta name="description" content={DESC} />
        <link rel="canonical" href={URL_} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESC} />
        <meta property="og:url" content={URL_} />
        <meta property="og:image" content={`${SITE_URL}/og/share-story.png`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={TITLE} />
        <meta name="twitter:description" content={DESC} />
        <meta name="twitter:image" content={`${SITE_URL}/og/share-story.png`} />
      </Helmet>
      <div className="text-center">
        <FinalistBadge className="mx-auto h-16 w-16" />
        <p className="mt-3 text-[11px] font-extrabold uppercase tracking-[0.2em] text-amber-600 dark:text-amber-400">Finalists and graduates</p>
        <h1 className="mt-2 font-serif text-3xl font-bold leading-tight sm:text-4xl">Talk to the students coming behind you</h1>
        <p className="mt-4 font-serif text-lg leading-relaxed text-muted-foreground">
          You made it through. The first years, the ones stuck in the anatomy lab, the ones dreading their first ward round: they are reading right now and wondering if it gets easier. Tell them the real version, the way you would in the hostel or the corridor.
        </p>
      </div>

      <div className="mt-8 rounded-2xl border border-border bg-card p-5">
        <p className="text-sm font-bold">Not sure where to start? Pick one:</p>
        <ul className="mt-3 space-y-2 text-[15px] text-foreground/80">
          {PROMPTS.map((p) => <li key={p} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />{p}</li>)}
        </ul>
      </div>

      <div className="mt-8 flex flex-col items-center gap-3">
        <Link to="/stories?write=1" className="inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 text-base font-bold text-primary-foreground shadow-sm">
          <PenLine className="h-5 w-5" /> Write my story
        </Link>
        <p className="text-xs text-muted-foreground">Takes a few minutes. Your name can stay private. Choose <strong>Finalist</strong> as your year.</p>
      </div>

      <div className="mt-10 rounded-2xl border border-border p-5 text-center">
        <p className="font-semibold">Pass it on to your classmates</p>
        <p className="mt-1 break-all text-sm text-muted-foreground">{URL_}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={copy} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:border-primary">
            <Copy className="h-4 w-4" /> {copied ? "Copied" : "Copy link"}
          </button>
          <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">
            <MessageCircle className="h-4 w-4" /> Send on WhatsApp
          </a>
        </div>
      </div>
      <p className="mt-8 text-center"><Link to="/stories" className="text-sm text-primary hover:underline">Read what other students wrote</Link></p>
    </main>
  );
}
