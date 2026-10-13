import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Settings2, Square, Volume2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_URL } from "@/lib/supabase-config";
import { useAuth } from "@/hooks/useAuth";
import { Narrator, genderOf, pickVoice, readPrefs, savePrefs, voices, type VoicePrefs } from "@/lib/speech";
import { cn } from "@/lib/utils";

const BUCKET = "page-audio";
const OWNER = "Abongo";
const keyOf = (path: string) => path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 90).toLowerCase() || "home";
const publicUrl = (key: string, ext: string) => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${key}.${ext}`;

/** The saved recording of this page, if the admin made one: its address, or null. */
let noBucket = false; // the storage bucket is not set up yet: stop asking, so the console stays quiet
async function findRecording(key: string): Promise<string | null> {
  if (noBucket) return null;
  for (const ext of ["mp3", "wav", "webm", "mp4"]) {
    try {
      const r = await fetch(publicUrl(key, ext), { method: "HEAD", cache: "no-store" });
      if (r.status === 400 && ext === "mp3") { noBucket = true; return null; }
      if (r.ok && /audio|video|octet/.test(r.headers.get("content-type") ?? "audio")) return `${publicUrl(key, ext)}?v=${encodeURIComponent(r.headers.get("etag") ?? r.headers.get("last-modified") ?? "")}`;
    } catch { /* none here */ }
  }
  return null;
}

/**
 * Listen to the page. "Abongo" is the admin's own recorded voice (used on every page that has a recording); anyone can choose a voice from
 * their device instead, with natural pauses. The admin records a page here: the text is shown to read from, and the saved recording is checked.
 */
export default function ListenControl({ text, path, btnClass }: { text: string; path: string; btnClass: string }) {
  const { isAdmin } = useAuth();
  const key = keyOf(path);
  const [playing, setPlaying] = useState(false);
  const [panel, setPanel] = useState(false);
  const [prefs, setPrefs] = useState<VoicePrefs>(readPrefs);
  const [all, setAll] = useState<SpeechSynthesisVoice[]>([]);
  const [own, setOwn] = useState<string | null | undefined>(undefined); // undefined: not looked for yet
  const [note, setNote] = useState("");
  const narrator = useRef(new Narrator());
  const audio = useRef<HTMLAudioElement | null>(null);
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

  const [rec, setRec] = useState<{ state: "idle" | "recording" | "ready" | "saving"; blob?: Blob; url?: string; secs: number }>({ state: "idle", secs: 0 });
  const recorder = useRef<MediaRecorder | null>(null);
  const tick = useRef<number | null>(null);
  const started = useRef(0);
  const script = useRef<HTMLDivElement | null>(null);

  useEffect(() => { if (canSpeak) void voices().then(setAll); }, [canSpeak]);
  useEffect(() => { savePrefs(prefs); }, [prefs]);
  useEffect(() => { let on = true; setOwn(undefined); void findRecording(key).then((u) => on && setOwn(u)); return () => { on = false; }; }, [key]);
  useEffect(() => () => { narrator.current.stop(); audio.current?.pause(); if (tick.current) window.clearInterval(tick.current); }, []);

  const stopAll = useCallback(() => { narrator.current.stop(); audio.current?.pause(); setPlaying(false); }, []);

  const toggle = async () => {
    if (playing) { stopAll(); return; }
    setNote("");
    let url = own;
    if (url === undefined) { url = await findRecording(key); setOwn(url); }
    if (prefs.own && url) {
      const a = new Audio(url);
      a.preload = "auto";
      a.playbackRate = Math.min(1.6, Math.max(0.6, prefs.rate / 0.95)); // the slider's 0.95 is "as I read it"
      a.onended = () => setPlaying(false);
      a.onerror = () => { setPlaying(false); setNote("That recording could not be played on this device. Reading it with a voice from the device instead."); };
      audio.current = a;
      try { await a.play(); setPlaying(true); return; } catch { setNote("Tap Listen again to play the recording."); return; }
    }
    if (!canSpeak) { setNote("This device has no reading voice."); return; }
    const list = all.length ? all : await voices();
    if (prefs.own && !url) setNote(`${OWNER} has not recorded this page yet, so it is read by a voice from your device.`);
    narrator.current.speak(text, prefs, pickVoice(list, prefs), () => setPlaying(false));
    setPlaying(true);
  };
  const sample = async () => {
    stopAll();
    if (prefs.own) { setNote(`${OWNER}'s voice plays on pages he has recorded. Choose another voice below to hear it.`); return; }
    narrator.current.speak("This is how I will read your notes. Take your time, and stop me whenever you like.", prefs, pickVoice(all, prefs), () => undefined);
  };

  const pick = (p: Partial<VoicePrefs>) => { stopAll(); setPrefs({ ...prefs, ...p }); };

  // ---- recording (admin) ----
  const startRec = async () => {
    setNote("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m));
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 64000 } : undefined);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (tick.current) { window.clearInterval(tick.current); tick.current = null; }
        const secs = Math.round((Date.now() - started.current) / 1000);
        const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
        if (secs < 3 || blob.size < 4000) { setRec({ state: "idle", secs: 0 }); setNote("That was too short to keep. Press Record and read the page again."); return; }
        setRec({ state: "ready", blob, url: URL.createObjectURL(blob), secs });
      };
      recorder.current = mr; started.current = Date.now();
      mr.start(1000);
      setRec({ state: "recording", secs: 0 });
      tick.current = window.setInterval(() => setRec((r) => (r.state === "recording" ? { ...r, secs: Math.round((Date.now() - started.current) / 1000) } : r)), 500);
    } catch { setNote("The microphone could not be opened. Allow microphone access for this site in your browser, then try again."); }
  };
  const saveRec = async () => {
    if (!rec.blob) return;
    setRec({ ...rec, state: "saving" });
    const ext = /mp4|aac/.test(rec.blob.type) ? "mp4" : "webm";
    const { error } = await supabase.storage.from(BUCKET).upload(`${key}.${ext}`, rec.blob, { upsert: true, contentType: rec.blob.type.split(";")[0] || "audio/webm", cacheControl: "60" });
    if (error) { setRec({ ...rec, state: "ready" }); setNote(/bucket|not found|row-level/i.test(error.message) ? "Run the analytics and voice SQL once in Supabase (supabase/migrations/20261013170000_site_analytics_and_voice.sql), then save again." : error.message); return; }
    const check = await findRecording(key); // proof that it can be heard
    setOwn(check);
    setRec({ state: "idle", secs: 0 });
    setNote(check ? `Saved. This page now plays in ${OWNER}'s voice. Tap Listen to hear it.` : "It uploaded but cannot be played back yet. Check that the page-audio storage bucket is public.");
  };
  const removeRec = async () => { await supabase.storage.from(BUCKET).remove([`${key}.mp3`, `${key}.wav`, `${key}.webm`, `${key}.mp4`]); setOwn(null); setNote("The recording was removed."); };

  // the page's text, line by line, to read from while recording
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(0, 80);
  const english = all.filter((v) => /^en/i.test(v.lang));
  const label = prefs.own && own ? `Listen · ${OWNER}` : "Listen";
  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      <button type="button" className={btnClass} onClick={toggle}>{playing ? <Square className="h-4 w-4 text-primary" aria-hidden /> : <Volume2 className="h-4 w-4 text-primary" aria-hidden />} {playing ? "Stop" : label}</button>
      <button type="button" aria-label="Voice settings" aria-expanded={panel} onClick={() => setPanel((v) => !v)} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border text-muted-foreground transition hover:border-primary/60 hover:text-primary"><Settings2 className="h-4 w-4" aria-hidden /></button>
      {note && !panel && <p className="basis-full text-sm font-semibold text-primary" role="status">{note}</p>}
      {panel && (
        <div className="basis-full space-y-4 rounded-2xl border border-border bg-background p-4 text-sm">
          <div>
            <p className="font-semibold">Voice</p>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Voice">
              <button type="button" onClick={() => pick({ own: true })} className={cn("h-9 rounded-full border px-4 font-semibold", prefs.own ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/60")}>{OWNER}</button>
              {(["auto", "female", "male"] as const).map((g) => <button key={g} type="button" onClick={() => pick({ own: false, gender: g, uri: "" })} className={cn("h-9 rounded-full border px-4 font-semibold", !prefs.own && prefs.gender === g && !prefs.uri ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/60")}>{g === "auto" ? "Best available" : g === "female" ? "Woman" : "Man"}</button>)}
            </div>
            {prefs.own && <p className="mt-2 text-muted-foreground">{OWNER}'s own recording plays on every page he has recorded. On the others, a voice from your device reads it.</p>}
            {english.length > 0 && (
              <select aria-label="Choose another voice" value={prefs.own ? "" : prefs.uri} onChange={(e) => pick({ own: false, uri: e.target.value })} className="mt-3 h-10 w-full rounded-lg border border-border bg-background px-3">
                <option value="">Another voice…</option>
                {english.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name}{genderOf(v) ? ` (${genderOf(v) === "male" ? "man" : "woman"})` : ""}</option>)}
              </select>
            )}
          </div>
          <label className="block"><span className="font-semibold">Speed</span>
            <input type="range" min={0.8} max={1.3} step={0.05} value={prefs.rate} onChange={(e) => { const rate = Number(e.target.value); setPrefs({ ...prefs, rate }); if (audio.current) audio.current.playbackRate = Math.min(1.6, Math.max(0.6, rate / 0.95)); }} className="mt-2 w-full accent-[hsl(var(--primary))]" />
            <span className="text-muted-foreground">The middle is the natural pace.</span>
          </label>
          <button type="button" onClick={sample} className="h-9 rounded-full border border-border px-4 font-semibold hover:border-primary/60">Hear a sample</button>
          {note && <p className="font-semibold text-primary" role="status">{note}</p>}

          {isAdmin && (
            <div className="space-y-3 border-t border-border pt-4">
              <p className="font-semibold">Record this page in your own voice (admin)</p>
              <p className="text-muted-foreground">Read the text below at your natural pace, with the pauses you want. Whatever you record is what everyone hears, at the speed you read it.</p>
              <div ref={script} className={cn("max-h-52 space-y-2 overflow-y-auto rounded-xl bg-muted/50 p-3 text-[15px] leading-relaxed", rec.state === "recording" && "ring-2 ring-destructive/50")}>
                {lines.map((l, i) => <p key={i} className={l.length < 70 && !/[.!?:]$/.test(l) ? "font-serif text-lg font-bold" : ""}>{l}</p>)}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {rec.state === "idle" && <button type="button" onClick={startRec} className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 font-bold text-primary-foreground"><Mic className="h-4 w-4" aria-hidden /> {own ? "Record again" : "Record"}</button>}
                {rec.state === "recording" && <><span className="inline-flex items-center gap-2 font-bold text-destructive"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" aria-hidden /> Recording {Math.floor(rec.secs / 60)}:{String(rec.secs % 60).padStart(2, "0")}</span><button type="button" onClick={() => recorder.current?.stop()} className="inline-flex h-11 items-center gap-2 rounded-full bg-destructive px-6 font-bold text-destructive-foreground"><Square className="h-4 w-4" aria-hidden /> Stop</button></>}
                {rec.state === "ready" && <><audio src={rec.url} controls className="h-11 max-w-full" /><button type="button" onClick={saveRec} className="h-11 rounded-full bg-primary px-6 font-bold text-primary-foreground">Use this recording</button><button type="button" onClick={() => setRec({ state: "idle", secs: 0 })} className="h-11 px-3 font-semibold text-muted-foreground">Discard</button></>}
                {rec.state === "saving" && <span className="text-muted-foreground">Saving…</span>}
                {rec.state === "idle" && own && <button type="button" onClick={removeRec} className="h-11 px-3 font-semibold text-muted-foreground hover:text-destructive">Remove my recording</button>}
              </div>
              {own && rec.state === "idle" && <p className="text-muted-foreground">This page already has your recording. Tap Listen to hear what readers hear.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
