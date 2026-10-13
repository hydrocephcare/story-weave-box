import { useEffect, useRef, useState } from "react";
import { Mic, Settings2, Square, Volume2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_URL } from "@/lib/supabase-config";
import { useAuth } from "@/hooks/useAuth";
import { Narrator, genderOf, pickVoice, readPrefs, savePrefs, voices, type VoicePrefs } from "@/lib/speech";
import { cn } from "@/lib/utils";

const BUCKET = "page-audio";
const keyOf = (path: string) => path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 90).toLowerCase() || "home";
const publicUrl = (key: string, ext: string) => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${key}.${ext}`;

/**
 * Listen to the page: the admin's own recording when there is one, otherwise the best voice on the device with natural pauses.
 * The voice (man or woman, which one, how fast) can be changed. The admin can record their own voice for a page here.
 */
export default function ListenControl({ text, path, btnClass }: { text: string; path: string; btnClass: string }) {
  const { isAdmin } = useAuth();
  const [playing, setPlaying] = useState(false);
  const [panel, setPanel] = useState(false);
  const [prefs, setPrefs] = useState<VoicePrefs>(readPrefs);
  const [all, setAll] = useState<SpeechSynthesisVoice[]>([]);
  const narrator = useRef(new Narrator());
  const audio = useRef<HTMLAudioElement | null>(null);
  const [rec, setRec] = useState<{ state: "idle" | "recording" | "ready" | "saving"; blob?: Blob; url?: string; msg?: string }>({ state: "idle" });
  const recorder = useRef<MediaRecorder | null>(null);
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;
  const key = keyOf(path);

  useEffect(() => { if (canSpeak) void voices().then(setAll); }, [canSpeak]);
  useEffect(() => () => { narrator.current.stop(); audio.current?.pause(); }, []);
  useEffect(() => { savePrefs(prefs); }, [prefs]);

  const stopAll = () => { narrator.current.stop(); audio.current?.pause(); setPlaying(false); };
  const toggle = async () => {
    if (playing) { stopAll(); return; }
    // the admin's own recording first
    for (const ext of ["webm", "mp4"]) {
      try {
        const head = await fetch(publicUrl(key, ext), { method: "HEAD" });
        if (head.ok) { const a = new Audio(`${publicUrl(key, ext)}?v=${head.headers.get("etag") ?? ""}`); audio.current = a; a.onended = () => setPlaying(false); await a.play(); setPlaying(true); return; }
      } catch { /* none: use the voice on the device */ }
    }
    if (!canSpeak) return;
    const list = all.length ? all : await voices();
    narrator.current.speak(text, prefs, pickVoice(list, prefs), () => setPlaying(false));
    setPlaying(true);
  };
  const sample = () => { if (!canSpeak) return; narrator.current.speak("This is how I will read your notes. Take your time, and stop me whenever you like.", prefs, pickVoice(all, prefs), () => undefined); };

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const mr = new MediaRecorder(stream);
      recorder.current = mr;
      mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      mr.onstop = () => { stream.getTracks().forEach((t) => t.stop()); const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" }); setRec({ state: "ready", blob, url: URL.createObjectURL(blob) }); };
      mr.start();
      setRec({ state: "recording" });
    } catch { setRec({ state: "idle", msg: "The microphone could not be opened." }); }
  };
  const saveRec = async () => {
    if (!rec.blob) return;
    setRec({ ...rec, state: "saving" });
    const ext = /mp4|aac/.test(rec.blob.type) ? "mp4" : "webm";
    const { error } = await supabase.storage.from(BUCKET).upload(`${key}.${ext}`, rec.blob, { upsert: true, contentType: rec.blob.type || "audio/webm", cacheControl: "300" });
    setRec(error ? { ...rec, state: "ready", msg: /bucket|not found/i.test(error.message) ? "Run the analytics and voice SQL once (supabase/migrations/20261013170000_site_analytics_and_voice.sql)." : error.message } : { state: "idle", msg: "Saved. This page now reads in your voice." });
  };
  const removeRec = async () => { await supabase.storage.from(BUCKET).remove([`${key}.webm`, `${key}.mp4`]); setRec({ state: "idle", msg: "Your recording was removed." }); };

  const english = all.filter((v) => /^en/i.test(v.lang));
  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      <button type="button" className={btnClass} onClick={toggle}>{playing ? <Square className="h-4 w-4 text-primary" aria-hidden /> : <Volume2 className="h-4 w-4 text-primary" aria-hidden />} {playing ? "Stop" : "Listen"}</button>
      <button type="button" aria-label="Voice settings" aria-expanded={panel} onClick={() => setPanel((v) => !v)} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border text-muted-foreground transition hover:border-primary/60 hover:text-primary"><Settings2 className="h-4 w-4" aria-hidden /></button>
      {panel && (
        <div className="basis-full space-y-4 rounded-2xl border border-border bg-background p-4 text-sm">
          <div>
            <p className="font-semibold">Voice</p>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Voice type">
              {(["auto", "female", "male"] as const).map((g) => <button key={g} type="button" onClick={() => setPrefs({ ...prefs, gender: g, uri: "" })} className={cn("h-9 rounded-full border px-4 font-semibold capitalize", prefs.gender === g && !prefs.uri ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/60")}>{g === "auto" ? "Best available" : g === "female" ? "Woman" : "Man"}</button>)}
            </div>
            {english.length > 0 && (
              <select aria-label="Choose a voice" value={prefs.uri} onChange={(e) => setPrefs({ ...prefs, uri: e.target.value })} className="mt-3 h-10 w-full rounded-lg border border-border bg-background px-3">
                <option value="">Choose for me</option>
                {english.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name}{genderOf(v) ? ` (${genderOf(v) === "male" ? "man" : "woman"})` : ""}</option>)}
              </select>
            )}
          </div>
          <label className="block"><span className="font-semibold">Speed</span>
            <input type="range" min={0.8} max={1.2} step={0.05} value={prefs.rate} onChange={(e) => setPrefs({ ...prefs, rate: Number(e.target.value) })} className="mt-2 w-full accent-[hsl(var(--primary))]" />
          </label>
          <button type="button" onClick={sample} className="h-9 rounded-full border border-border px-4 font-semibold hover:border-primary/60">Hear a sample</button>

          {isAdmin && (
            <div className="border-t border-border pt-4">
              <p className="font-semibold">Your own voice for this page (admin)</p>
              <p className="mt-1 text-muted-foreground">Read the page aloud once. From then on everyone who taps Listen on it hears you.</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {rec.state === "idle" && <button type="button" onClick={startRec} className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 font-bold text-primary-foreground"><Mic className="h-4 w-4" aria-hidden /> Record</button>}
                {rec.state === "recording" && <button type="button" onClick={() => recorder.current?.stop()} className="inline-flex h-10 items-center gap-2 rounded-full bg-destructive px-5 font-bold text-destructive-foreground"><Square className="h-4 w-4" aria-hidden /> Stop recording</button>}
                {rec.state === "ready" && (<><audio src={rec.url} controls className="h-10" /><button type="button" onClick={saveRec} className="h-10 rounded-full bg-primary px-5 font-bold text-primary-foreground">Use this recording</button><button type="button" onClick={() => setRec({ state: "idle" })} className="h-10 px-3 font-semibold text-muted-foreground">Discard</button></>)}
                {rec.state === "saving" && <span className="text-muted-foreground">Saving…</span>}
                {rec.state === "idle" && <button type="button" onClick={removeRec} className="h-10 px-3 font-semibold text-muted-foreground hover:text-destructive">Remove my recording</button>}
              </div>
              {rec.msg && <p className="mt-2 font-semibold text-primary" role="status">{rec.msg}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
