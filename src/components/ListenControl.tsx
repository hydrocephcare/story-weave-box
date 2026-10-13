import { useEffect, useRef, useState } from "react";
import { Settings2, Square, Volume2 } from "lucide-react";
import { Narrator, genderOf, pickVoice, readPrefs, savePrefs, voices, type VoicePrefs } from "@/lib/speech";
import { cn } from "@/lib/utils";

/**
 * Listen to the page: the best voice on the device, with natural pauses after titles, sentences and commas.
 * The voice (man or woman, which one) and the speed can be changed.
 */
export default function ListenControl({ text, btnClass }: { text: string; path?: string; btnClass: string }) {
  const [playing, setPlaying] = useState(false);
  const [panel, setPanel] = useState(false);
  const [prefs, setPrefs] = useState<VoicePrefs>(readPrefs);
  const [all, setAll] = useState<SpeechSynthesisVoice[]>([]);
  const [note, setNote] = useState("");
  const narrator = useRef(new Narrator());
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => { if (canSpeak) void voices().then(setAll); }, [canSpeak]);
  useEffect(() => { savePrefs(prefs); }, [prefs]);
  useEffect(() => () => narrator.current.stop(), []);

  const stop = () => { narrator.current.stop(); setPlaying(false); };
  const toggle = async () => {
    if (playing) { stop(); return; }
    if (!canSpeak) { setNote("This device has no reading voice."); return; }
    setNote("");
    const list = all.length ? all : await voices();
    narrator.current.speak(text, prefs, pickVoice(list, prefs), () => setPlaying(false));
    setPlaying(true);
  };
  const sample = () => { stop(); narrator.current.speak("This is how I will read your notes. Take your time, and stop me whenever you like.", prefs, pickVoice(all, prefs), () => undefined); };
  const pick = (p: Partial<VoicePrefs>) => { stop(); setPrefs({ ...prefs, ...p }); };

  const english = all.filter((v) => /^en/i.test(v.lang));
  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      <button type="button" className={btnClass} onClick={toggle}>{playing ? <Square className="h-4 w-4 text-primary" aria-hidden /> : <Volume2 className="h-4 w-4 text-primary" aria-hidden />} {playing ? "Stop" : "Listen"}</button>
      <button type="button" aria-label="Voice settings" aria-expanded={panel} onClick={() => setPanel((v) => !v)} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border text-muted-foreground transition hover:border-primary/60 hover:text-primary"><Settings2 className="h-4 w-4" aria-hidden /></button>
      {note && <p className="basis-full text-sm font-semibold text-primary" role="status">{note}</p>}
      {panel && (
        <div className="basis-full space-y-4 rounded-2xl border border-border bg-background p-4 text-sm">
          <div>
            <p className="font-semibold">Voice</p>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Voice">
              {(["auto", "female", "male"] as const).map((g) => <button key={g} type="button" onClick={() => pick({ gender: g, uri: "" })} className={cn("h-9 rounded-full border px-4 font-semibold", prefs.gender === g && !prefs.uri ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/60")}>{g === "auto" ? "Best available" : g === "female" ? "Woman" : "Man"}</button>)}
            </div>
            {english.length > 0 && (
              <select aria-label="Choose another voice" value={prefs.uri} onChange={(e) => pick({ uri: e.target.value })} className="mt-3 h-10 w-full rounded-lg border border-border bg-background px-3">
                <option value="">Another voice…</option>
                {english.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name}{genderOf(v) ? ` (${genderOf(v) === "male" ? "man" : "woman"})` : ""}</option>)}
              </select>
            )}
          </div>
          <label className="block"><span className="font-semibold">Speed</span>
            <input type="range" min={0.8} max={1.3} step={0.05} value={prefs.rate} onChange={(e) => setPrefs({ ...prefs, rate: Number(e.target.value) })} className="mt-2 w-full accent-[hsl(var(--primary))]" />
          </label>
          <button type="button" onClick={sample} className="h-9 rounded-full border border-border px-4 font-semibold hover:border-primary/60">Hear a sample</button>
        </div>
      )}
    </div>
  );
}
