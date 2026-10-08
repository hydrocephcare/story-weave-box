import { Fragment, useMemo } from "react";
import { queryTerms } from "@/lib/queryTerms";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Wraps every searched word in <mark> so learners can see why a result matched. */
export default function Highlight({ text, query }: { text: string; query: string }) {
  const parts = useMemo(() => {
    const terms = queryTerms(query);
    if (!terms.length) return [text];
    return text.split(new RegExp(`(${terms.map(esc).join("|")})`, "gi"));
  }, [text, query]);
  const terms = useMemo(() => new Set(queryTerms(query)), [query]);
  return <>{parts.map((p, i) => <Fragment key={i}>{terms.has(p.toLowerCase()) ? <mark className="rounded-sm bg-yellow-200 px-0.5 text-black dark:bg-yellow-300/90">{p}</mark> : p}</Fragment>)}</>;
}
