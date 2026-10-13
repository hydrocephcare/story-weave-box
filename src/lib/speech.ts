// A calmer way to read a page aloud with the voices the device already has: the best voice first, a short pause after each sentence, a
// longer one after a paragraph or a heading, and a steady, slightly slower pace. Nothing leaves the device.

export interface VoicePrefs { gender: "auto" | "male" | "female"; uri: string; rate: number }
const KEY = "ompath_voice_prefs";
export const DEFAULT_PREFS: VoicePrefs = { gender: "auto", uri: "", rate: 0.95 };

export const readPrefs = (): VoicePrefs => { try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return DEFAULT_PREFS; } };
export const savePrefs = (p: VoicePrefs) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ } };

const FEMALE = /zira|hazel|samantha|susan|female|jenny|aria|sonia|libby|karen|victoria|moira|tessa|fiona|catherine|serena|natasha|clara|emily|kate|heera|ava|allison|nicole/i;
const MALE = /david|mark|guy|george|daniel|male|ryan|alex\b|fred|oliver|thomas|james|richard|brian|christopher|eric|davis|liam|rishi|ravi|prabhat|arthur|lee\b|aaron/i;
export const genderOf = (v: SpeechSynthesisVoice): "male" | "female" | "" => (FEMALE.test(v.name) ? "female" : MALE.test(v.name) ? "male" : "");

/** How pleasant a voice is likely to be: neural and natural voices first, then Google's, then the plain ones. */
function score(v: SpeechSynthesisVoice): number {
  let s = 0;
  if (/natural|neural|online|premium|enhanced|studio/i.test(v.name)) s += 50;
  if (/google/i.test(v.name)) s += 25;
  if (/en-(GB|AU|ZA|KE|NG|IN|US)/i.test(v.lang)) s += 8;
  if (/en-GB|en-ZA|en-KE|en-NG/i.test(v.lang)) s += 4;
  if (v.localService) s += 2;
  if (/espeak|compact/i.test(v.name)) s -= 40;
  return s;
}

export function voices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return resolve([]);
    const get = () => window.speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
    const now = get();
    if (now.length) return resolve(now);
    const done = () => { window.speechSynthesis.removeEventListener("voiceschanged", done); resolve(get()); };
    window.speechSynthesis.addEventListener("voiceschanged", done);
    setTimeout(done, 1500);
  });
}

export function pickVoice(all: SpeechSynthesisVoice[], p: VoicePrefs): SpeechSynthesisVoice | undefined {
  if (p.uri) { const own = all.find((v) => v.voiceURI === p.uri); if (own) return own; }
  const pool = p.gender === "auto" ? all : all.filter((v) => genderOf(v) === p.gender);
  return [...(pool.length ? pool : all)].sort((a, b) => score(b) - score(a))[0];
}

/** Splits a page into spoken pieces, each with the pause that follows it (milliseconds). */
export function pieces(text: string): { t: string; pause: number }[] {
  const out: { t: string; pause: number }[] = [];
  for (const para of text.replace(/\r/g, "").split(/\n+/)) {
    const p = para.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/^\s*#{1,6}\s*/, "").replace(/^\s*[-*>]\s+/, "").replace(/[*_`|]/g, "").replace(/\s+/g, " ").trim();
    if (!p || /^[-: ]+$/.test(p)) continue;
    const heading = p.length < 70 && !/[.!?:]$/.test(p);
    if (heading) { out.push({ t: p, pause: 750 }); continue; }
    const sents = p.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g) ?? [p];
    sents.forEach((s, i) => {
      const t = s.trim(); if (!t) return;
      // a long sentence is broken at its commas and semicolons, with a breath between the parts
      const parts = t.length > 110 ? t.split(/(?<=[,;:])\s+/) : [t];
      parts.forEach((part, k) => out.push({ t: part, pause: k < parts.length - 1 ? 170 : i === sents.length - 1 ? 620 : 300 }));
    });
  }
  return out.slice(0, 160);
}

export class Narrator {
  private timer: number | null = null;
  private stopped = true;
  speak(text: string, prefs: VoicePrefs, voice: SpeechSynthesisVoice | undefined, onEnd: () => void) {
    this.stop(); this.stopped = false;
    const list = pieces(text);
    let i = 0;
    const next = () => {
      if (this.stopped) return;
      if (i >= list.length) { this.stopped = true; onEnd(); return; }
      const { t, pause } = list[i++];
      const u = new SpeechSynthesisUtterance(t);
      if (voice) { u.voice = voice; u.lang = voice.lang; }
      u.rate = prefs.rate;
      u.pitch = 1;
      u.onend = () => { this.timer = window.setTimeout(next, pause); };
      u.onerror = () => { this.timer = window.setTimeout(next, 50); };
      window.speechSynthesis.speak(u);
    };
    next();
  }
  stop() {
    this.stopped = true;
    if (this.timer) { window.clearTimeout(this.timer); this.timer = null; }
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
  }
}
