import { useState } from "react";
import { HelpCircle } from "lucide-react";

/**
 * When Ompath AI needs one more detail (which year, which university, when to remind you), it asks in a card with tappable answers,
 * so nobody has to type. Asking costs nothing. `other` adds a small box for an answer that is not in the list.
 */
export default function ClarifyCard({ question, options, other, disabled, onPick }: { question: string; options: string[]; other?: string; disabled?: boolean; onPick: (answer: string) => void }) {
  const [text, setText] = useState("");
  return (
    <section className={`rounded-2xl border border-primary/25 bg-primary/5 p-3.5 transition-opacity ${disabled ? "pointer-events-none opacity-50" : ""}`} aria-label="Quick question">
      <p className="flex items-start gap-2 text-sm font-semibold"><HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {question}</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {options.map((o) => <button key={o} type="button" onClick={() => onPick(o)} disabled={disabled} className="rounded-full border border-primary/30 bg-background px-3.5 py-2 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground active:scale-95">{o}</button>)}
      </div>
      {other && (
        <form className="mt-2.5 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) onPick(text.trim()); }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={other} aria-label={other} maxLength={80} disabled={disabled} className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
          <button type="submit" disabled={disabled || !text.trim()} className="h-10 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-40">Add</button>
        </form>
      )}
    </section>
  );
}
