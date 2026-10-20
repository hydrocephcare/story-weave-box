// Speaking to the flashcards: a short listening session that ends by itself when you stop talking, and a fair comparison of what you said with the answer.
// Speech recognition mishears medical words, so the comparison forgives small spelling differences and uses the recogniser's other guesses too.
import { distance } from "@/lib/spell";

type SR = { lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number; start(): void; stop(): void; onresult: ((e: any) => void) | null; onerror: ((e: any) => void) | null; onend: (() => void) | null };

export const recallSupported = (): boolean => typeof window !== "undefined" && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

export interface Listening { stop: () => void }
export type EndReason = "silence" | "nothing" | "stopped" | "denied" | "error";

/**
 * Starts listening. `onText` gets the live text (what you have said so far); `onEnd` is called once, with the final text and every alternative the recogniser
 * offered, when you pause for `quietMs` after speaking (or nothing was said for `waitMs`, or you stopped it).
 */
export function listen(opts: { lang?: string; quietMs?: number; waitMs?: number; maxMs?: number; onText: (t: string) => void; onEnd: (text: string, alts: string[], why: EndReason) => void }): Listening | null {
  const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!Ctor) return null;
  const r: SR = new Ctor();
  r.lang = opts.lang || "en-US"; r.interimResults = true; r.continuous = true; r.maxAlternatives = 3;
  let kept = "";            // the finished sentences so far
  let interim = "";         // the sentence being spoken
  const alts = new Set<string>();
  let finished = false, heard = false, quiet = 0, wait = 0, cap = 0;
  const live = () => (interim && interim.startsWith(kept) ? interim : `${kept} ${interim}`.trim());
  const finish = (why: EndReason) => {
    if (finished) return; finished = true;
    window.clearTimeout(quiet); window.clearTimeout(wait); window.clearTimeout(cap);
    const text = live();
    try { r.onresult = null; r.onerror = null; r.onend = null; r.stop(); } catch { /* already stopped */ }
    opts.onEnd(text, [...alts], why === "silence" && !text ? "nothing" : why);
  };
  const rearm = () => { window.clearTimeout(quiet); quiet = window.setTimeout(() => finish("silence"), opts.quietMs ?? 1700); };
  r.onresult = (e: any) => {
    heard = true; window.clearTimeout(wait);
    interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i]; const said = String(res[0]?.transcript || "").trim();
      for (let k = 0; k < res.length; k++) { const a = String(res[k]?.transcript || "").trim(); if (a) alts.add(a); }
      // some phones repeat the whole sentence in every result: a result that contains what is kept replaces it, one already kept is skipped
      if (res.isFinal) { if (said.startsWith(kept)) kept = said; else if (!kept.endsWith(said)) kept = `${kept} ${said}`.trim(); } else interim = said;
    }
    opts.onText(live()); rearm();
  };
  r.onerror = (e: any) => { const code = String(e?.error || ""); if (code === "not-allowed" || code === "service-not-allowed") finish("denied"); else if (code === "no-speech") finish(heard ? "silence" : "nothing"); else if (code !== "aborted") finish("error"); };
  r.onend = () => finish(heard ? "silence" : "nothing");
  wait = window.setTimeout(() => finish("nothing"), opts.waitMs ?? 9000);
  cap = window.setTimeout(() => finish("silence"), opts.maxMs ?? 40000);
  try { r.start(); } catch { finish("error"); return null; }
  return { stop: () => finish("stopped") };
}

/** Reads text aloud; `onDone` runs when the voice has finished (so the microphone is never open while the phone is talking). */
export function sayAloud(text: string, onDone?: () => void) {
  try {
    const clean = text.replace(/[*_#>`!\[\]]/g, " ").replace(/\s+-\s+/g, ", ").replace(/\s+/g, " ").trim();
    const u = new SpeechSynthesisUtterance(clean); u.lang = "en-GB"; u.rate = 0.95;
    u.onend = () => onDone?.(); u.onerror = () => onDone?.();
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
  } catch { onDone?.(); }
}
export const stopAloud = () => { try { window.speechSynthesis.cancel(); } catch { /* none */ } };

const bare = (t: string) => t.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter(Boolean);

/** The words that carry the answer: its bold headline, or its first line. */
export function keyWords(answer: string): string[] {
  const bold = /[*][*]([^*]+)[*][*]/.exec(answer)?.[1] ?? answer.split("\n")[0];
  return [...new Set(bare(bold).filter((w) => w.length > 3))];
}

/** How much of the answer's key words you said: a word counts if it was said, or something very close to it (the recogniser's spelling of it). 0 to 100. */
export function matchPercent(answer: string, said: string, alts: string[] = []): number {
  const keys = keyWords(answer);
  if (!keys.length) return 0;
  // a long word is often heard as two ("hypo thyroidism"), so neighbouring words are also tried joined
  const words = [said, ...alts].flatMap((t) => { const w = bare(t); return [...w, ...w.slice(1).map((x, i) => w[i] + x)]; });
  const heard = new Set(words);
  let hit = 0;
  for (const k of keys) {
    const tol = k.length >= 9 ? 3 : k.length >= 6 ? 2 : 1;
    let ok = false;
    for (const h of heard) { if (h === k || (h.length >= 4 && k.startsWith(h.slice(0, Math.max(4, h.length - 2)))) || distance(h, k) <= tol) { ok = true; break; } }
    if (ok) hit++;
  }
  return Math.round((hit / keys.length) * 100);
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Accurate voice: record the sound, notice when you start and stop talking, and have Whisper (on the server) write down what was said. It hears medical words
// and accents far better than the browser's own recogniser, and works the same in every browser that can record.

export const recordingSupported = (): boolean => typeof window !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";

export type RecordEnd = "silence" | "nothing" | "stopped" | "denied" | "error";
export interface Recording { stop: () => void }

/**
 * Records the microphone until you stop talking. `onLevel` (0 to 1) shows that you are being heard; `onSpeech` fires once when talking starts.
 * `onEnd` gets the recorded clip (null when nothing was said) and why it ended.
 */
export function recordSpeech(opts: { quietMs?: number; waitMs?: number; maxMs?: number; onLevel?: (v: number) => void; onSpeech?: () => void; onEnd: (clip: { blob: Blob; mime: string } | null, why: RecordEnd) => void }): Recording {
  let finished = false, stream: MediaStream | null = null, rec: MediaRecorder | null = null, ctx: AudioContext | null = null, timer = 0, cap = 0;
  const chunks: Blob[] = [];
  let spoke = false, speechAt = 0, lastLoud = 0, floor = 0.01, frames = 0, loud = 0;
  const startedAt = Date.now();
  let why: RecordEnd = "silence";
  const cleanup = () => {
    window.clearInterval(timer); window.clearTimeout(cap);
    try { stream?.getTracks().forEach((t) => t.stop()); } catch { /* none */ }
    try { void ctx?.close(); } catch { /* none */ }
  };
  const end = (reason: RecordEnd) => {
    if (finished) return; finished = true; why = reason;
    window.clearInterval(timer); window.clearTimeout(cap);
    if (rec && rec.state !== "inactive") { try { rec.stop(); } catch { cleanup(); opts.onEnd(null, "error"); } } else { cleanup(); opts.onEnd(null, reason); }
  };
  void (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) { finished = true; opts.onEnd(null, (e as { name?: string })?.name === "NotAllowedError" ? "denied" : "error"); return; }
    if (finished) { cleanup(); return; }
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((m) => { try { return MediaRecorder.isTypeSupported(m); } catch { return false; } }) || "";
    try { rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); } catch { cleanup(); finished = true; opts.onEnd(null, "error"); return; }
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      cleanup();
      const type = rec?.mimeType || mime || "audio/webm";
      const blob = new Blob(chunks, { type });
      opts.onEnd(spoke && blob.size > 1500 ? { blob, mime: type } : null, spoke ? why : why === "stopped" ? "stopped" : "nothing");
    };
    rec.start(250);
    // listen to the level: speech is a clear rise above the room's own noise
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      ctx = new AC!();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser(); an.fftSize = 1024; src.connect(an);
      const buf = new Uint8Array(an.fftSize);
      timer = window.setInterval(() => {
        an.getByteTimeDomainData(buf);
        let sum = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        const rms = Math.sqrt(sum / buf.length);
        frames++;
        if (frames <= 8) floor = (floor * (frames - 1) + rms) / frames;   // the room's own noise, measured in the first moments
        const thr = Math.max(0.02, Math.min(floor, 0.025) * 3.2);   // capped, so talking from the very first moment is still heard
        opts.onLevel?.(Math.min(1, rms / (thr * 3)));
        const now = Date.now();
        if (rms > thr) { loud++; if (loud >= 2) { lastLoud = now; if (!spoke) { spoke = true; speechAt = now; opts.onSpeech?.(); } } } else loud = 0;
        if (spoke && now - lastLoud > (opts.quietMs ?? 1700) && now - speechAt > 700) end("silence");
        else if (!spoke && now - startedAt > (opts.waitMs ?? 9000)) end("nothing");
      }, 50);
    } catch { /* no level meter: the length limit still ends the recording */ }
    cap = window.setTimeout(() => end(spoke ? "silence" : "nothing"), opts.maxMs ?? 45000);
  })();
  return { stop: () => end("stopped") };
}

/** Sends a clip to the server and returns the words. `hint` (the card's question and key words) helps it hear medical terms. */
export async function transcribe(clip: { blob: Blob; mime: string }, hint: string): Promise<string> {
  const audio: string = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1] || ""); fr.onerror = () => rej(new Error("read")); fr.readAsDataURL(clip.blob); });
  const r = await fetch("/api/ai?task=transcribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ audio, mime: clip.mime, hint }), signal: AbortSignal.timeout(30000) });
  const j = (await r.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!r.ok) throw new Error(j.error || "The voice service could not answer.");
  return String(j.text || "");
}
