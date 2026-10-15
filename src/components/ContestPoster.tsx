import { useState } from "react";
import { Download, Image as ImageIcon, Loader2 } from "lucide-react";
import type { ContestRecord, ContestUniversity } from "@/lib/contest-store";
import { downloadDataUrl, hueOf, makeStatusPoster, type PosterSpec } from "@/lib/statusPoster";

const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-KE", { ...o, timeZone: "Africa/Nairobi" }).format(new Date(iso));

export function contestPosterSpec(contest: ContestRecord, universities: ContestUniversity[], university?: ContestUniversity): PosterSpec {
  const live = contest.stage === "live", reg = contest.stage === "registration";
  const chosen = contest.universityIds.length ? universities.filter((u) => contest.universityIds.includes(u.id)) : [];
  const uniName = university?.abbreviation || university?.name;
  return {
    kicker: "Inter-university contest",
    status: { label: live ? "Live now" : reg ? "Registration open" : contest.stage === "completed" ? "Finished" : "Coming soon", live },
    title: contest.title,
    subtitle: contest.subtitle || (chosen.length ? "" : "Medical students across Kenya compete on one leaderboard."),
    duel: chosen.length >= 2 ? chosen.slice(0, 3).map((u) => ({ name: u.abbreviation || u.name, hue: hueOf(u.slug) })) : undefined,
    when: contest.startsAt ? { top: fmt(contest.startsAt, { weekday: "long", day: "numeric", month: "long" }), bottom: `${fmt(contest.startsAt, { hour: "numeric", minute: "2-digit" })} · East Africa Time` } : undefined,
    pills: [...contest.years.map((y) => `Year ${y}`), ...(chosen.length ? [] : ["All universities"]), ...contest.subjects.slice(0, 3)],
    cta: { title: uniName ? `Represent ${uniName}` : "Represent your university", sub: "Register free on ompathstudy.com" },
    url: `https://www.ompathstudy.com/contests/${contest.slug}`,
  };
}

/** Makes a 1080x1920 WhatsApp-status poster for a contest, in the browser. Optionally with one university's name on the button. */
export default function ContestPoster({ contest, universities, university, className = "" }: { contest: ContestRecord; universities: ContestUniversity[]; university?: ContestUniversity; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState("");
  async function make() {
    setBusy(true);
    try {
      const url = await makeStatusPoster(contestPosterSpec(contest, universities, university));
      setPreview(url); downloadDataUrl(url, `${contest.slug}${university ? `-${university.slug}` : ""}-status.png`);
    } finally { setBusy(false); }
  }
  return (
    <div className={className}>
      <button type="button" onClick={() => void make()} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-3 text-sm font-bold text-white/80 hover:bg-white/5 disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : preview ? <Download className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />} Status poster
      </button>
      {preview && <img src={preview} alt={`${contest.title} status poster`} className="mt-3 w-40 rounded-lg border border-white/10" />}
    </div>
  );
}
