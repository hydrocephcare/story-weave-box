import { useState } from "react";
import { Download, Image as ImageIcon, Loader2 } from "lucide-react";
import type { ContestRecord, ContestUniversity } from "@/lib/contest-store";

const W = 1080, H = 1920;

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []; let line = "";
  for (const word of text.split(/\s+/)) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function draw(contest: ContestRecord, universities: ContestUniversity[], uniName?: string): HTMLCanvasElement {
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  const bg = ctx.createLinearGradient(0, 0, W, H); bg.addColorStop(0, "#071315"); bg.addColorStop(0.6, "#0b2a2c"); bg.addColorStop(1, "#103c3a");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.8, H * 0.18, 20, W * 0.8, H * 0.18, 700); glow.addColorStop(0, "rgba(39,196,180,0.35)"); glow.addColorStop(1, "rgba(39,196,180,0)");
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#fff"; ctx.textBaseline = "alphabetic";

  // brand
  ctx.fillStyle = "#5eead4"; ctx.beginPath(); ctx.roundRect(80, 90, 84, 84, 20); ctx.fill();
  ctx.fillStyle = "#071315"; ctx.font = "900 46px Georgia, serif"; ctx.textAlign = "center"; ctx.fillText("O", 122, 148);
  ctx.textAlign = "left"; ctx.fillStyle = "#fff"; ctx.font = "700 42px Georgia, serif"; ctx.fillText("Ompath Study", 186, 148);

  // status chip
  const live = contest.stage === "live", reg = contest.stage === "registration";
  const chip = live ? "LIVE NOW" : reg ? "REGISTRATION OPEN" : contest.stage === "completed" ? "FINISHED" : "COMING SOON";
  ctx.font = "800 34px Arial, sans-serif"; const cw = ctx.measureText(chip).width + 64;
  ctx.fillStyle = live ? "#f87171" : "#5eead4"; ctx.beginPath(); ctx.roundRect(80, 330, cw, 76, 38); ctx.fill();
  ctx.fillStyle = "#071315"; ctx.fillText(chip, 112, 381);

  // title
  ctx.fillStyle = "#fff"; ctx.font = "800 112px Georgia, serif";
  let y = 560; for (const l of wrap(ctx, contest.title, W - 160).slice(0, 4)) { ctx.fillText(l, 80, y); y += 128; }
  ctx.fillStyle = "rgba(255,255,255,0.72)"; ctx.font = "400 44px Arial, sans-serif";
  y += 10; for (const l of wrap(ctx, contest.subtitle || "Medical students across Kenya compete on one leaderboard.", W - 160).slice(0, 3)) { ctx.fillText(l, 80, y); y += 62; }

  // date + details
  y += 50;
  if (contest.startsAt) {
    ctx.fillStyle = "#5eead4"; ctx.font = "800 36px Arial, sans-serif"; ctx.fillText("STARTS", 80, y);
    ctx.fillStyle = "#fff"; ctx.font = "700 54px Arial, sans-serif";
    ctx.fillText(new Intl.DateTimeFormat("en-KE", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Nairobi" }).format(new Date(contest.startsAt)), 80, y + 68);
    ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.font = "400 40px Arial, sans-serif";
    ctx.fillText(new Intl.DateTimeFormat("en-KE", { hour: "numeric", minute: "2-digit", timeZone: "Africa/Nairobi" }).format(new Date(contest.startsAt)) + " EAT", 80, y + 124);
    y += 200;
  }
  const meta = [contest.subjects.join(" · "), contest.years.length ? contest.years.map((v) => `Year ${v}`).join(", ") : ""].filter(Boolean);
  ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.font = "400 38px Arial, sans-serif";
  for (const m of meta) for (const l of wrap(ctx, m, W - 160).slice(0, 2)) { ctx.fillText(l, 80, y); y += 54; }

  // universities
  const list = contest.universityIds.length ? universities.filter((u) => contest.universityIds.includes(u.id)) : universities;
  const names = list.slice(0, 8).map((u) => u.abbreviation || u.name);
  if (names.length) {
    y += 40; ctx.font = "800 30px Arial, sans-serif"; ctx.fillStyle = "#5eead4";
    ctx.fillText(contest.universityIds.length ? "CHOSEN UNIVERSITIES" : "OPEN TO ALL UNIVERSITIES", 80, y); y += 30;
    let x = 80; ctx.font = "700 34px Arial, sans-serif";
    for (const n of names) {
      const w = ctx.measureText(n).width + 44;
      if (x + w > W - 80) { x = 80; y += 80; }
      ctx.fillStyle = "rgba(255,255,255,0.1)"; ctx.beginPath(); ctx.roundRect(x, y, w, 62, 31); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.fillText(n, x + 22, y + 43); x += w + 14;
    }
    if (list.length > names.length) { ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.fillText(`+${list.length - names.length} more`, x, y + 43); }
    y += 100;
  }

  // call to action
  const cta = uniName ? `Represent ${uniName}` : "Represent your university";
  ctx.fillStyle = "#5eead4"; ctx.beginPath(); ctx.roundRect(80, H - 330, W - 160, 130, 30); ctx.fill();
  ctx.fillStyle = "#071315"; ctx.font = "900 50px Arial, sans-serif"; ctx.textAlign = "center"; ctx.fillText(cta, W / 2, H - 248);
  ctx.font = "600 32px Arial, sans-serif"; ctx.fillText("Register free on ompathstudy.com", W / 2, H - 208);
  ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.font = "400 30px Arial, sans-serif";
  ctx.fillText(`ompathstudy.com/contests/${contest.slug}`.slice(0, 60), W / 2, H - 120);
  return c;
}

/** Makes a 1080x1920 WhatsApp-status poster for a contest, in the browser. Optionally with one university's name on the button. */
export default function ContestPoster({ contest, universities, university, className = "" }: { contest: ContestRecord; universities: ContestUniversity[]; university?: ContestUniversity; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState("");
  async function make() {
    setBusy(true);
    try {
      await document.fonts?.ready;
      const canvas = draw(contest, universities, university?.abbreviation || university?.name);
      const url = canvas.toDataURL("image/png"); setPreview(url);
      const a = document.createElement("a"); a.href = url; a.download = `${contest.slug}${university ? `-${university.slug}` : ""}-status.png`; a.click();
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
