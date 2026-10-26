import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { PenLine, Copy } from "lucide-react";
import { useState } from "react";
import { SITE_URL } from "@/lib/seo";

const URL_ = `${SITE_URL}/share-your-story`;

export default function ShareYourStory() {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(URL_); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ } };
  return (
    <main className="mx-auto max-w-xl px-5 py-14 text-center">
      <Helmet>
        <title>Share your medical school story | OmpathStudy Kenya</title>
        <meta name="description" content="Finalists and graduates: tell juniors what medical school was really like. Write your experience and publish it on OmpathStudy in minutes." />
      </Helmet>
      <h1 className="font-serif text-3xl font-bold leading-tight sm:text-4xl">Tell the juniors what med school was really like</h1>
      <p className="mt-4 font-serif text-lg leading-relaxed text-muted-foreground">
        Finalist or recent graduate? Your first ward round, the exams that nearly broke you, what you would do differently. Write it in your own words and it goes live as a story. We tidy the spelling, spacing and layout for you.
      </p>
      <Link to="/stories?write=1" className="mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-bold text-primary-foreground">
        <PenLine className="h-4 w-4" /> Write my story
      </Link>
      <div className="mt-10 rounded-2xl border border-border p-4 text-sm">
        <p className="font-semibold">Pass this link to other finalists</p>
        <p className="mt-1 break-all text-muted-foreground">{URL_}</p>
        <button type="button" onClick={copy} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 font-semibold hover:border-primary">
          <Copy className="h-4 w-4" /> {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      <Link to="/stories" className="mt-8 inline-block text-sm text-primary hover:underline">Read other stories</Link>
    </main>
  );
}
