/** One poster maker for WhatsApp status / Instagram story pictures (1080 x 1920): contests and any page the assistant publishes. Drawn in the browser, nothing is uploaded. */
export interface PosterSpec {
  kicker: string;                 // small label above the title, e.g. "STUDY NOTES"
  status?: { label: string; live?: boolean };
  title: string;
  subtitle?: string;
  duel?: { name: string; hue: number }[];   // 2-3 universities shown as big round badges
  when?: { top: string; bottom?: string };  // e.g. { top: "Saturday, 17 October", bottom: "8:00 PM EAT" }
  pills?: string[];               // years, category ...
  cta: { title: string; sub: string };
  url: string;
}

const W = 1080, H = 1920, PAD = 84;
export const hueOf = (s: string) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []; let line = "";
  for (const word of text.split(/\s+/)) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

const loadImg = (src: string) => new Promise<HTMLImageElement | null>((resolve) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = () => resolve(null); im.src = src; });

export async function makeStatusPoster(spec: PosterSpec): Promise<string> {
  try { await document.fonts?.load("700 60px Poppins"); await document.fonts?.load("700 80px 'Source Serif 4'"); } catch { /* fall back to system fonts */ }
  const mark = await loadImg("/brand/mark-dark.png");
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  const serif = "'Source Serif 4', Georgia, serif", sans = "'Source Sans 3', Arial, sans-serif";

  const bg = ctx.createLinearGradient(0, 0, W, H); bg.addColorStop(0, "#06161a"); bg.addColorStop(0.55, "#0b2a2c"); bg.addColorStop(1, "#0f3b3a");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.85, H * 0.14, 10, W * 0.85, H * 0.14, 760); glow.addColorStop(0, "rgba(39,196,180,0.32)"); glow.addColorStop(1, "rgba(39,196,180,0)");
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  const glow2 = ctx.createRadialGradient(W * 0.1, H * 0.9, 10, W * 0.1, H * 0.9, 640); glow2.addColorStop(0, "rgba(249,115,82,0.16)"); glow2.addColorStop(1, "rgba(249,115,82,0)");
  ctx.fillStyle = glow2; ctx.fillRect(0, 0, W, H);

  // brand
  let bx = PAD;
  if (mark) { const h = 120, w = h * (mark.naturalWidth / mark.naturalHeight); ctx.drawImage(mark, PAD, 84, w, h); bx = PAD + w + 22; }
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.font = "700 62px Poppins, Arial, sans-serif"; ctx.fillStyle = "#fff"; ctx.fillText("Ompath", bx, 172);
  ctx.fillStyle = "#5eead4"; ctx.fillText("Study", bx + ctx.measureText("Ompath").width, 172);

  let y = 330;
  // kicker + status
  ctx.font = `800 32px ${sans}`; ctx.fillStyle = "#5eead4"; ctx.fillText(spec.kicker.toUpperCase(), PAD, y);
  if (spec.status) {
    ctx.font = `800 30px ${sans}`; const label = spec.status.label.toUpperCase(); const pw = ctx.measureText(label).width + 56;
    ctx.fillStyle = spec.status.live ? "#f87171" : "#5eead4"; ctx.beginPath(); ctx.roundRect(W - PAD - pw, y - 46, pw, 66, 33); ctx.fill();
    ctx.fillStyle = "#06161a"; ctx.fillText(label, W - PAD - pw + 28, y - 2);
  }
  y += 40;

  // title: shrinks for long names so it never runs off the picture
  const maxW = W - PAD * 2;
  let size = 112; let lines: string[] = [];
  for (; size >= 62; size -= 6) { ctx.font = `700 ${size}px ${serif}`; lines = wrap(ctx, spec.title, maxW); if (lines.length <= 4) break; }
  ctx.fillStyle = "#fff"; ctx.font = `700 ${size}px ${serif}`;
  y += size * 0.95; for (const l of lines.slice(0, 4)) { ctx.fillText(l, PAD, y); y += size * 1.08; }

  if (spec.subtitle) { ctx.font = `400 42px ${sans}`; ctx.fillStyle = "rgba(255,255,255,0.72)"; y += 6; for (const l of wrap(ctx, spec.subtitle, maxW).slice(0, 3)) { ctx.fillText(l, PAD, y); y += 58; } }
  y += 30;

  // the universities, big and round, with "vs" between them
  if (spec.duel?.length) {
    const n = spec.duel.length, r = n === 2 ? 138 : 112, gap = n === 2 ? 150 : 96;
    const total = n * r * 2 + (n - 1) * gap; let x = (W - total) / 2 + r; const cy = y + r + 10;
    spec.duel.slice(0, 3).forEach((u, i) => {
      const g = ctx.createLinearGradient(x - r, cy - r, x + r, cy + r); g.addColorStop(0, `hsl(${u.hue} 62% 42%)`); g.addColorStop(1, `hsl(${(u.hue + 40) % 360} 66% 26%)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = "rgba(255,255,255,0.28)"; ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = `900 ${r * 0.5}px ${sans}`; ctx.fillText(u.name.slice(0, 5).toUpperCase(), x, cy + r * 0.17);
      if (i < n - 1) { ctx.font = `900 54px ${sans}`; ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.fillText("VS", x + r + gap / 2, cy + 18); }
      x += r * 2 + gap;
    });
    ctx.textAlign = "left"; y = cy + r + 70;
  }

  // date card
  if (spec.when) {
    const h = spec.when.bottom ? 176 : 130;
    ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.beginPath(); ctx.roundRect(PAD, y, maxW, h, 28); ctx.fill();
    ctx.fillStyle = "#5eead4"; ctx.font = `800 28px ${sans}`; ctx.fillText("STARTS", PAD + 36, y + 52);
    ctx.fillStyle = "#fff"; ctx.font = `700 52px ${sans}`; ctx.fillText(spec.when.top, PAD + 36, y + 112);
    if (spec.when.bottom) { ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.font = `600 38px ${sans}`; ctx.fillText(spec.when.bottom, PAD + 36, y + 158); }
    y += h + 36;
  }

  // pills (years, category)
  if (spec.pills?.length) {
    ctx.font = `800 34px ${sans}`; let x = PAD;
    for (const p of spec.pills.slice(0, 8)) {
      const w = ctx.measureText(p).width + 48;
      if (x + w > W - PAD) { x = PAD; y += 78; }
      ctx.fillStyle = "rgba(255,255,255,0.13)"; ctx.beginPath(); ctx.roundRect(x, y, w, 60, 30); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.fillText(p, x + 24, y + 42); x += w + 14;
    }
  }

  // call to action pinned to the bottom
  const bh = 188, by = H - 120 - bh - 80;
  ctx.fillStyle = "#5eead4"; ctx.beginPath(); ctx.roundRect(PAD, by, maxW, bh, 36); ctx.fill();
  ctx.fillStyle = "#06161a"; ctx.textAlign = "center";
  ctx.font = `900 56px ${sans}`; ctx.fillText(spec.cta.title, W / 2, by + 82);
  ctx.font = `700 34px ${sans}`; ctx.fillText(spec.cta.sub, W / 2, by + 138);
  ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.font = `500 31px ${sans}`;
  let url = spec.url.replace(/^https?:\/\//, ""); while (ctx.measureText(url).width > maxW && url.length > 12) url = `${url.slice(0, -2)}…`;
  ctx.fillText(url, W / 2, H - 96);
  return c.toDataURL("image/png");
}

export function downloadDataUrl(url: string, name: string) { const a = document.createElement("a"); a.href = url; a.download = name; a.click(); }
