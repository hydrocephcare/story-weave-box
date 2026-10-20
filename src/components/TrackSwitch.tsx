import { useNavigate } from "react-router-dom";
import { chooseTrack, useTrack, type Track } from "@/lib/courseTrack";

/** One tap between the MBChB site and the Dental site. The choice is remembered on this device and wins over the course on the profile. */
export default function TrackSwitch({ className = "", dark = true, onSwitch }: { className?: string; dark?: boolean; onSwitch?: () => void }) {
  const track = useTrack();
  const navigate = useNavigate();
  const go = (t: Track) => { if (t === track) return; chooseTrack(t); navigate(t === "dental" ? "/dental" : "/"); onSwitch?.(); };
  const on = dark ? "bg-white text-[#0b3b36]" : "bg-primary text-primary-foreground";
  const off = dark ? "text-white/75 hover:text-white" : "text-muted-foreground hover:text-foreground";
  return (
    <div role="group" aria-label="Course" className={`inline-flex overflow-hidden rounded-full border ${dark ? "border-white/25" : "border-border"} text-xs font-bold ${className}`}>
      {([["medicine", "MBChB"], ["dental", "Dental"]] as [Track, string][]).map(([t, label]) => <button key={t} type="button" aria-pressed={track === t} onClick={() => go(t)} className={`px-3 py-1.5 transition-colors ${track === t ? on : off}`}>{label}</button>)}
    </div>
  );
}
