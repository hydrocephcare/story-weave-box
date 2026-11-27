import { useCallback, useEffect, useState } from "react";
import { Check, Copy, KeyRound, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Config = { configured: boolean; runtimeReady: boolean; runtimeKeyConfigured?: boolean; syncAvailable?: boolean; aiReady: boolean; updatedAt: string | null; key?: string };
export default function PolishConnect() {
  const [config, setConfig] = useState<Config | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);

  const request = useCallback(async (method: "GET" | "POST", body?: unknown) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Sign in with the administrator account first.");
    const response = await fetch("/api/ai?task=polishConfig", {
      method,
      headers: { "content-type": "application/json", Authorization: `Bearer ${session.access_token}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Polish configuration failed (${response.status}).`);
    return data as Config;
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setMsg("");
    try { setConfig(await request("GET")); }
    catch (error) { setMsg(error instanceof Error ? error.message : "Could not check the polishing connection."); }
    finally { setLoading(false); }
  }, [request]);

  useEffect(() => { void load(); }, [load]);

  const syncRuntime = async () => {
    setBusy(true); setMsg(""); setKey(null);
    try {
      const result = await request("POST", { action: "sync-runtime" });
      setConfig(result);
      setMsg("Cloudflare's existing POLISH_WRITE_KEY has been securely synced to Neon. The secret value was not displayed.");
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Could not sync the Cloudflare polishing secret.");
    } finally { setBusy(false); }
  };

  const rotate = async () => {
    setBusy(true); setMsg(""); setKey(null);
    try {
      const result = await request("POST", { action: "rotate" });
      setConfig(result); setKey(result.key || null);
      setMsg("New secret saved in Neon. Add it to the two secret stores below before the release.");
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Could not update the polishing secret.");
    } finally { setBusy(false); }
  };

  const copy = async () => {
    if (!key) return;
    try { await navigator.clipboard.writeText(key); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setMsg("Clipboard access was blocked. Select and copy the key manually."); }
  };

  return (
    <section className="mt-8 max-w-2xl rounded-2xl border border-border p-5" aria-label="Blog polishing connection">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-primary"><KeyRound className="h-4 w-4" aria-hidden /> Blog polishing connection</div>
      {loading ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Checking Neon, AI providers and runtime secret…</p>
      ) : (
        <div className="mt-3 space-y-2 text-sm">
          <p className="flex items-center gap-2">{config?.configured ? <Check className="h-4 w-4 text-emerald-500" /> : <span className="h-2 w-2 rounded-full bg-amber-500" />} Database secret: {config?.configured ? "saved in Neon" : "not configured"}</p>
          <p className="flex items-center gap-2">{config?.aiReady ? <Check className="h-4 w-4 text-emerald-500" /> : <span className="h-2 w-2 rounded-full bg-amber-500" />} Groq and Gemini keys: {config?.aiReady ? "present in runtime" : "one or both missing"}</p>
          <p className="flex items-center gap-2">{config?.runtimeReady ? <Check className="h-4 w-4 text-emerald-500" /> : <span className="h-2 w-2 rounded-full bg-amber-500" />} Cloudflare runtime secret: {config?.runtimeReady ? "matches the Neon secret" : config?.runtimeKeyConfigured ? "configured; sync it to Neon" : "missing"}</p>
          {config?.updatedAt && <p className="text-xs text-muted-foreground">Last changed: {new Date(config.updatedAt).toLocaleString()}</p>}
        </div>
      )}
      {key && (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-semibold">Copy this new key now. It is shown only once.</p>
          <p className="break-all rounded-xl bg-muted/60 px-3 py-3 font-mono text-xs">{key}</p>
          <button type="button" onClick={copy} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold"><Copy className="h-4 w-4" />{copied ? "Copied" : "Copy key"}</button>
        </div>
      )}
      <div className="mt-4 rounded-xl bg-muted/50 p-3 text-sm leading-relaxed">
        <p className="font-semibold">Required secret configuration</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Cloudflare → Workers & Pages → <strong>ompathstudy-main</strong> → Settings → Variables and Secrets → Production: add <strong>POLISH_WRITE_KEY</strong> as an encrypted secret.</li>
          <li>GitHub → <strong>hydrocephcare/story-weave-box</strong> → Settings → Secrets and variables → Actions: add <strong>POLISH_WRITE_KEY</strong> and <strong>DATABASE_URL</strong>.</li>
          <li>Ensure GitHub Actions also has <strong>GROQ_API_KEYS</strong> and <strong>GEMINI_API_KEYS</strong> so the scheduled batch can run.</li>
        </ol>
        <p className="mt-2 text-xs text-muted-foreground">The site-open polish uses Cloudflare secrets. The scheduled backlog processor uses GitHub Actions secrets and writes directly to Neon; it no longer calls the retired Supabase REST API.</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={busy || loading || !config?.syncAvailable} onClick={() => void syncRuntime()} className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Sync existing Cloudflare secret
        </button>
        <button type="button" disabled={busy || loading} onClick={() => void rotate()} className="inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold disabled:opacity-50">
          <RefreshCw className="h-4 w-4" /> {config?.configured ? "Rotate secret" : "Create secret"}
        </button>
        <button type="button" disabled={busy || loading} onClick={() => void load()} className="inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold disabled:opacity-50">Check again</button>
      </div>
      {msg && <p className="mt-3 text-sm font-medium text-foreground" role="status">{msg}</p>}
    </section>
  );
}
