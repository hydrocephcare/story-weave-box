import { startTransition } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { chooseTrack, useTrack, type Track } from "@/lib/courseTrack";
import { SECTIONS } from "@/lib/sections";

const LABELS: [Track, string][] = [["medicine", "MBChB"], ...SECTIONS.map((s) => [s.slug as Track, s.name] as [Track, string])];

/** One tap between the courses: MBChB and the paper sections (Dental, IT, Business...). The choice is remembered on this device and wins over the profile course. */
export default function TrackSwitch({ className = "", dark = true, onSwitch }: { className?: string; dark?: boolean; onSwitch?: () => void }) {
  const track = useTrack();
  const navigate = useNavigate();
  // the menu and the page change in one transition: the old page stays on screen until the new one is ready, so nothing flashes or bounces back
  const go = (t: Track) => { if (t === track) return; startTransition(() => { chooseTrack(t); navigate(t === "medicine" ? "/" : `/${t}`); }); onSwitch?.(); };
  return (
    <label className={`relative inline-flex items-center ${className}`}>
      <span className="sr-only">Course</span>
      <select value={track} onChange={(e) => go(e.target.value as Track)} aria-label="Course" className={`h-8 appearance-none rounded-full border py-0 pl-3 pr-7 text-xs font-bold outline-none ${dark ? "border-white/25 bg-white/10 text-white" : "border-border bg-background text-foreground"}`}>
        {LABELS.map(([t, label]) => <option key={t} value={t} className="text-neutral-900">{label}</option>)}
      </select>
      <ChevronDown className={`pointer-events-none absolute right-2 h-3.5 w-3.5 ${dark ? "text-white/80" : "text-muted-foreground"}`} aria-hidden />
    </label>
  );
}
