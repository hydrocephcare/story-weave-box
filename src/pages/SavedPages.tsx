import { useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Bookmark, BookOpen, FileText, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { savedNotes, savedTopics, toggleSavedNote, toggleTopicSaved } from "@/lib/savedPages";
import { findStaticNote } from "@/data/staticNotes";
import { topicPath } from "@/lib/topics";

/** /saved: everything this student saved on this device, topics and notes together. */
export default function SavedPages() {
  const { user } = useAuth();
  const [tick, setTick] = useState(0);
  void tick;
  const topics = savedTopics(user?.id);
  const notes = savedNotes(user?.id).map((s) => findStaticNote(s)).filter((n): n is NonNullable<ReturnType<typeof findStaticNote>> => Boolean(n));
  const empty = !topics.length && !notes.length;
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Helmet><title>Saved | Ompath Study</title><meta name="robots" content="noindex" /></Helmet>
      <h1 className="flex items-center gap-3 font-serif text-4xl font-bold"><Bookmark className="h-8 w-8 text-primary" aria-hidden /> Saved</h1>
      <p className="mt-2 text-[16px] text-muted-foreground">Pages you saved with the Save button. They are kept on this device{user ? " for your account" : ""}.</p>
      {empty && <p className="mt-10 rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">Nothing saved yet. Tap <strong>Save</strong> on a topic page or a note and it will wait for you here.</p>}
      {topics.length > 0 && (
        <section className="mt-8">
          <h2 className="font-serif text-2xl font-bold">Topics</h2>
          <ul className="mt-3 divide-y divide-border rounded-2xl border border-border">
            {topics.map((t) => (
              <li key={t.s} className="flex items-center gap-3 px-4 py-3">
                <BookOpen className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                <Link to={topicPath(t.s)} className="min-w-0 flex-1 truncate font-semibold hover:underline">{t.n}</Link>
                <button type="button" aria-label={`Remove ${t.n}`} onClick={() => { toggleTopicSaved(user?.id, t.s, t.n); setTick((n) => n + 1); }} className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {notes.length > 0 && (
        <section className="mt-8">
          <h2 className="font-serif text-2xl font-bold">Notes</h2>
          <ul className="mt-3 divide-y divide-border rounded-2xl border border-border">
            {notes.map((n) => (
              <li key={n.slug} className="flex items-center gap-3 px-4 py-3">
                <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                <Link to={`/notes/${n.slug}`} className="min-w-0 flex-1"><span className="block truncate font-semibold hover:underline">{n.title}</span><span className="block truncate text-sm text-muted-foreground">Year {n.year} · {n.unit}</span></Link>
                <button type="button" aria-label={`Remove ${n.title}`} onClick={() => { toggleSavedNote(user?.id, n.slug); setTick((x) => x + 1); }} className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
