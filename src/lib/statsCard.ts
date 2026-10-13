// Draws the shareable picture of the site's numbers (for WhatsApp and the like) on a canvas: 1080 x 1350.
export interface StatsDay { day: string; visitors: number; members: number; views: number }
export interface StatsCardInput { label: string; range: string; visitors: number; members: number; views: number; returning: number; daily: StatsDay[] }

const fmt = (n: number) => n.toLocaleString("en-US");

export function drawStatsCard(canvas: HTMLCanvasElement, s: StatsCardInput) {
  const W = 1080, H = 1350;
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext("2d")!;
  const g = c.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#0b2545"); g.addColorStop(0.55, "#0f4c5c"); g.addColorStop(1, "#0f766e");
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // soft light behind the numbers
  const r = c.createRadialGradient(W * 0.8, 260, 20, W * 0.8, 260, 560);
  r.addColorStop(0, "rgba(120,220,200,0.28)"); r.addColorStop(1, "rgba(120,220,200,0)");
  c.fillStyle = r; c.fillRect(0, 0, W, H);

  const sans = "'Segoe UI', Inter, Arial, sans-serif", serif = "Georgia, 'Times New Roman', serif";
  c.textBaseline = "alphabetic";
  c.fillStyle = "#f2b632"; c.beginPath(); c.arc(92, 112, 11, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#bfe3dd"; c.font = `700 34px ${sans}`; c.fillText("OMPATH STUDY", 116, 124);

  c.fillStyle = "#e6f4f1"; c.font = `600 40px ${sans}`; c.fillText(s.label, 80, 232);
  c.fillStyle = "#9fd2c9"; c.font = `400 30px ${sans}`; c.fillText(s.range, 80, 280);

  c.fillStyle = "#ffffff"; c.font = `700 190px ${serif}`; c.fillText(fmt(s.visitors), 74, 500);
  c.fillStyle = "#cfe8e4"; c.font = `500 40px ${sans}`; c.fillText("people used the site", 80, 560);

  const stat = (x: number, label: string, v: number) => {
    c.fillStyle = "#ffffff"; c.font = `700 72px ${serif}`; c.fillText(fmt(v), x, 700);
    c.fillStyle = "#9fd2c9"; c.font = `500 28px ${sans}`; c.fillText(label, x, 744);
  };
  stat(80, "signed-in students", s.members);
  stat(420, "guests", Math.max(0, s.visitors - s.members));
  stat(690, "pages opened", s.views);

  // the daily line
  const days = s.daily.length ? s.daily : [{ day: "", visitors: 0, members: 0, views: 0 }];
  const x0 = 80, x1 = W - 80, y0 = 1130, y1 = 830;
  const max = Math.max(5, ...days.map((d) => d.visitors));
  const px = (i: number) => (days.length === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (days.length - 1));
  const py = (v: number) => y0 - ((y0 - y1) * v) / max;
  c.strokeStyle = "rgba(255,255,255,0.12)"; c.lineWidth = 2;
  for (let k = 0; k <= 3; k++) { const y = y0 - ((y0 - y1) * k) / 3; c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke(); }
  const area = c.createLinearGradient(0, y1, 0, y0); area.addColorStop(0, "rgba(242,182,50,0.42)"); area.addColorStop(1, "rgba(242,182,50,0)");
  c.beginPath(); c.moveTo(px(0), y0); days.forEach((d, i) => c.lineTo(px(i), py(d.visitors))); c.lineTo(px(days.length - 1), y0); c.closePath(); c.fillStyle = area; c.fill();
  c.beginPath(); days.forEach((d, i) => (i ? c.lineTo(px(i), py(d.visitors)) : c.moveTo(px(i), py(d.visitors)))); c.strokeStyle = "#f2b632"; c.lineWidth = 6; c.lineJoin = "round"; c.stroke();
  const peak = days.reduce((a, d, i) => (d.visitors > days[a].visitors ? i : a), 0);
  c.fillStyle = "#f2b632"; c.beginPath(); c.arc(px(peak), py(days[peak].visitors), 11, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#ffffff"; c.font = `700 28px ${sans}`; c.textAlign = "center"; c.fillText(fmt(days[peak].visitors), px(peak), py(days[peak].visitors) - 24);
  c.fillStyle = "#9fd2c9"; c.font = `400 26px ${sans}`;
  const label = (d: StatsDay) => (d.day ? new Date(`${d.day}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");
  c.textAlign = "left"; c.fillText(label(days[0]), x0, y0 + 46);
  c.textAlign = "right"; c.fillText(label(days[days.length - 1]), x1, y0 + 46);
  c.textAlign = "left";
  c.fillStyle = "#cfe8e4"; c.font = `500 30px ${sans}`;
  c.fillText(`${fmt(s.returning)} came back more than once`, 80, 1226);

  c.fillStyle = "#ffffff"; c.font = `700 40px ${sans}`; c.fillText("ompathstudy.com", 80, 1296);
  c.textAlign = "right"; c.fillStyle = "#9fd2c9"; c.font = `400 26px ${sans}`; c.fillText("Free medical notes, past papers and MCQs", W - 80, 1296); c.textAlign = "left";
}
