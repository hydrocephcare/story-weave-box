// Two separate sites in one: MBChB (medicine, the default) and Dental. A student belongs to one of them, chosen by the course on their profile (or, for a guest,
// by the section they came in through). The dental track never shows medical menus and the medical track never shows dental ones.
import { useEffect, useState } from "react";

export type Track = "medicine" | "dental";
const KEY = "ompath_track";

/** Which track a profile's course belongs to. */
export const trackFromCourse = (course: string | null | undefined): Track => (/dental|\bbds\b|oral health/i.test(String(course ?? "")) ? "dental" : "medicine");

export function getTrack(): Track {
  try { return localStorage.getItem(KEY) === "dental" ? "dental" : "medicine"; } catch { return "medicine"; }
}

export function setTrack(t: Track) {
  try { if (getTrack() === t) return; localStorage.setItem(KEY, t); } catch { /* blocked */ }
  window.dispatchEvent(new Event("ompath:track"));
}

/** The current track, kept up to date when it changes (a profile loads, someone signs out, a dental page is opened). */
export function useTrack(): Track {
  const [t, setT] = useState<Track>(() => getTrack());
  useEffect(() => {
    const on = () => setT(getTrack());
    window.addEventListener("ompath:track", on);
    window.addEventListener("ompath:signed-out", on);
    window.addEventListener("storage", on);
    return () => { window.removeEventListener("ompath:track", on); window.removeEventListener("ompath:signed-out", on); window.removeEventListener("storage", on); };
  }, []);
  return t;
}

const MANUAL = "ompath_track_manual";
/** True once the student has picked a course with the switch on this device: from then on the profile no longer overrides it. */
export const isManualTrack = (): boolean => { try { return localStorage.getItem(MANUAL) === "1"; } catch { return false; } };
/** The student's own pick (the switch): remembered, and it wins over the profile course. */
export function chooseTrack(t: Track) {
  try { localStorage.setItem(MANUAL, "1"); } catch { /* blocked */ }
  setTrack(t);
}
