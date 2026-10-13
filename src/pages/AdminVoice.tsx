import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSetting, saveSetting } from "@/lib/store";

const SCRIPT = [
  "Welcome to Ompath Study. I am a medical student, and I made this site so that notes, past papers and questions can live in one place.",
  "Let us begin with a simple idea. When you meet a patient, you listen first, you ask about the story, and then you examine, always asking yourself what could explain what you have found.",
  "The heart is a four-chambered muscular pump. Blood returns to the right atrium, passes to the right ventricle, and travels to the lungs, where it picks up oxygen before coming back to the left side.",
  "Anaemia is a reduction in haemoglobin. Ask three questions: is the marrow making too few red cells, is something destroying them, or is blood being lost? Each question leads to a different set of tests.",
  "Take your time with these notes. Read them slowly, test yourself often, and ask when you are stuck. That is how it sticks.",
];
export const VOICE_KEY = "voice_clone";

/** Admin: record about a minute and a half of reading once; the site can then read pages aloud in that voice. */
export default function AdminVoice() {
  const [state, setState] = useState<"idle" | "recording" | "ready" | "working">("idle");
  const [secs, setSecs] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [msg, setMsg] = useState("");
  const mr = useRef<MediaRecorder | null>(null);
  const t0 = useRef(0);
  const timer = useRef<number | null>(null);
  useEffect(() => { void getSetting(VOICE_KEY).then((t) => { try { setVoiceId(JSON.parse(t || "{}").voiceId || ""); } catch { /* none */ } }).catch(() => undefined); }, []);

  const start = async () => {
    setMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true } });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
      const r = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 96000 } : undefined);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = () => { stream.getTracks().forEach((x) => x.stop()); if (timer.current) window.clearInterval(timer.current); const b = new Blob(chunks, { type: r.mimeType || "audio/webm" }); setBlob(b); setUrl(URL.createObjectURL(b)); setState("ready"); };
      mr.current = r; t0.current = Date.now(); r.start(1000); setState("recording"); setSecs(0);
      timer.current = window.setInterval(() => setSecs(Math.round((Date.now() - t0.current) / 1000)), 500);
    } catch { setMsg("The microphone could not be opened. Allow it for this site and try again."); }
  };
  const make = async () => {
    if (!blob) return;
    if (secs < 30) { setMsg("Please read for at least 30 seconds, ideally a minute and a half, so the copy sounds like you."); return; }
    setState("working"); setMsg("");
    try {
      const b64 = await new Promise<string>((res, rej) => { const f = new FileReader(); f.onload = () => res(String(f.result).split(",")[1] ?? ""); f.onerror = rej; f.readAsDataURL(blob); });
      const { data } = await supabase.auth.getSession();
      const r = await fetch("/api/voice", { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` }, body: JSON.stringify({ action: "clone", audio: b64, mime: blob.type, name: "Abongo" }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error === "setup" ? j.message : j.error || "It did not work.");
      await saveSetting(VOICE_KEY, JSON.stringify({ voiceId: j.voiceId, name: "Abongo", at: new Date().toISOString() }));
      setVoiceId(j.voiceId); setMsg("Done. Your voice is saved. Open any page, tap the settings icon beside Listen, and press \"Read this page in my voice\".");
    } catch (e) { setMsg((e as Error).message); }
    setState("idle");
  };

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Admin</p>
      <h1 className="mt-1 font-serif text-4xl font-bold">My voice</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground">Read the lines below once, in your natural voice, for about a minute and a half. A copy of your voice is made, and then any page can be read aloud in it. {voiceId ? "Your voice is already saved; record again to replace it." : ""}</p>
      <div className="mt-6 space-y-3 rounded-2xl bg-muted/50 p-4 text-[17px] leading-relaxed">{SCRIPT.map((l, i) => <p key={i}>{l}</p>)}</div>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        {state === "idle" && <button type="button" onClick={start} className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-7 font-bold text-primary-foreground"><Mic className="h-4 w-4" aria-hidden /> Start recording</button>}
        {state === "recording" && <><span className="font-bold text-destructive">Recording {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}</span><button type="button" onClick={() => mr.current?.stop()} className="inline-flex h-12 items-center gap-2 rounded-full bg-destructive px-7 font-bold text-destructive-foreground"><Square className="h-4 w-4" aria-hidden /> Stop</button></>}
        {state === "ready" && <><audio src={url} controls className="max-w-full" /><button type="button" onClick={make} className="h-12 rounded-full bg-primary px-7 font-bold text-primary-foreground">Make my voice</button><button type="button" onClick={() => setState("idle")} className="h-12 px-3 font-semibold text-muted-foreground">Record again</button></>}
        {state === "working" && <span className="inline-flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Making your voice…</span>}
      </div>
      {msg && <p className="mt-4 text-[15px] font-semibold text-primary" role="status">{msg}</p>}
    </main>
  );
}
