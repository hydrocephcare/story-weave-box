import { useCallback, useEffect, useState } from "react";
import { Check, Copy, KeyRound, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Db = { from: (t: string) => any };
const ZERO = "00000000-0000-0000-0000-000000000000";

/** The one-time link between the site's server and the database for blog polishing: a private key the admin makes here (no Supabase access needed). */
export default function PolishConnect() {
  const db = supabase as unknown as Db;
  const [key, setKey] = useState<string | null | undefined>(undefined); // undefined: loading, null: none yet
  const [server, setServer] = useState<"checking" | "yes" | "no">("checking");
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);

  const checkServer = useCallback(async () => {
    setServer("checking");
    try {
      // a made-up page id: the server answers "unavailable" when it has no key or no AI keys, and "invalid" when it is ready
      const r = await fetch("/api/ai-polish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: ZERO }) });
      const j = (await r.json().catch(() => ({}))) as { status?: string };
      setServer(j.status === "unavailable" ? "no" : "yes");
    } catch { setServer("no"); }
  }, []);

  useEffect(() => {
    void (async () => {
      const { data, error } = await db.from("polish_secret").select("secret").maybeSingle();
      setKey(error ? null : (data?.secret ?? null));
      if (error) setMsg("The database is not ready for this yet. It is set up automatically when the latest update is applied; try again in a few minutes.");
    })();
    void checkServer();
  }, [db, checkServer]);

  const make = async () => {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const k = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    const { error } = await db.from("polish_secret").upsert({ id: 1, secret: k, updated_at: new Date().toISOString() });
    if (error) { setMsg(error.message); return; }
    setMsg(""); setKey(k); setServer("no");
  };
  const copy = async () => { try { await navigator.clipboard.writeText(key ?? ""); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* copy by hand */ } };

  return (
    <section className="mt-8 max-w-2xl" aria-label="Connect the polish">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-primary"><KeyRound className="h-4 w-4" aria-hidden /> Connect</p>
      <p className="mt-2 flex items-center gap-2 text-[16px] text-foreground/85">
        {server === "checking" ? <><Loader2 className="h-4 w-4 animate-spin" /> Checking the server…</> : server === "yes" ? <><Check className="h-4 w-4 text-emerald-500" /> The server is connected: blogs are polished when someone opens them.</> : "The server is not connected yet, so nothing is being polished."}
      </p>
      {server === "no" && (
        <div className="mt-4 text-[16px] leading-relaxed text-foreground/85">
          {key === undefined ? null : key === null ? (
            <button type="button" onClick={make} className="h-11 rounded-full bg-primary px-6 font-bold text-primary-foreground">Make the key</button>
          ) : (
            <>
              <p>The key is saved in the database. Now paste it in two places (it stays private):</p>
              <p className="mt-3 break-all rounded-xl bg-muted/60 px-4 py-3 font-mono text-[14px]">{key}</p>
              <button type="button" onClick={copy} className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline"><Copy className="h-4 w-4" aria-hidden /> {copied ? "Copied" : "Copy the key"}</button>
              <ol className="mt-4 list-decimal space-y-2 pl-5">
                <li><strong>Vercel:</strong> your project, Settings, Environment Variables. Name <strong>POLISH_WRITE_KEY</strong>, value the key, type Secret. Then redeploy.</li>
                <li><strong>GitHub</strong> (for the daily batch): in a terminal, <code className="rounded bg-muted px-1.5 py-0.5 text-[13px]">gh secret set POLISH_WRITE_KEY</code>, then paste the key.</li>
              </ol>
              <button type="button" onClick={checkServer} className="mt-4 h-10 rounded-full border border-border px-5 text-sm font-bold hover:border-primary/60">Check again</button>
              <button type="button" onClick={make} className="ml-3 h-10 text-sm font-semibold text-muted-foreground hover:text-destructive">Make a new key</button>
            </>
          )}
        </div>
      )}
      {msg && <p className="mt-3 text-sm font-semibold text-primary" role="status">{msg}</p>}
    </section>
  );
}
