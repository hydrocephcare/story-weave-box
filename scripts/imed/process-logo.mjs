// Cuts the supplied Ompath Study logo into the files the site needs, using headless Chrome's canvas (no image library needed).
//   node scripts/imed/process-logo.mjs <logo.png> <outDir>
// Writes: logo-light.png (for light backgrounds), logo-dark.png (white + mint, for dark/teal backgrounds), mark-light.png / mark-dark.png (the O mark alone), icon-512.png, icon-192.png, favicon.png
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const [, , src, outDir] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const b64 = fs.readFileSync(src).toString("base64");
const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const port = 9400 + Math.floor(Math.random() * 200);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "logo-"));
const proc = spawn(chrome, ["--headless=new", "--disable-gpu", `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let list;
for (let i = 0; i < 40; i++) { try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (list.length) break; } catch { /* not up */ } await sleep(300); }
const ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result ?? d.error); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });

const code = `(async () => {
  const img = new Image(); img.src = "data:image/png;base64,${b64}"; await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, W, H), p = d.data;
  // white background -> transparent (soft edge so the anti-aliasing stays smooth)
  for (let i = 0; i < p.length; i += 4) { const w = Math.min(p[i], p[i + 1], p[i + 2]); p[i + 3] = w >= 246 ? 0 : w <= 205 ? 255 : Math.round(255 * (246 - w) / 41); }
  const row = (y) => { for (let xx = 0; xx < W; xx++) if (p[(y * W + xx) * 4 + 3] > 40) return true; return false; };
  const col = (xx, y0, y1) => { for (let y = y0; y < y1; y++) if (p[(y * W + xx) * 4 + 3] > 40) return true; return false; };
  // rows: find where content starts, and the gap that separates the lockup from the tagline
  let top = 0; while (!row(top)) top++;
  let y = top, gapStart = -1; let seenContent = false, gap = 0;
  for (y = top; y < H; y++) { if (row(y)) { seenContent = true; gap = 0; } else if (seenContent) { gap++; if (gap >= 14) { gapStart = y - gap + 1; break; } } }
  const lockBottom = gapStart > 0 ? gapStart : H;
  let left = W, right = 0; for (let xx = 0; xx < W; xx++) if (col(xx, top, lockBottom)) { left = Math.min(left, xx); right = Math.max(right, xx); }
  // the mark: scan columns in the lower part (below the cap) for the first empty column after the ring
  const midY0 = Math.round(top + (lockBottom - top) * 0.45), midY1 = lockBottom;
  let markRight = left; let started = false; for (let xx = left; xx <= right; xx++) { if (col(xx, midY0, midY1)) { started = true; markRight = xx; } else if (started && xx - markRight > 6) break; }
  const pad = 6;
  const crop = (sx, sy, sw, sh, recolor) => { const o = document.createElement("canvas"); o.width = sw; o.height = sh; const ox = o.getContext("2d", { willReadFrequently: true }); const im = ox.createImageData(sw, sh);
    for (let yy = 0; yy < sh; yy++) for (let xx = 0; xx < sw; xx++) { const s = ((sy + yy) * W + sx + xx) * 4, t = (yy * sw + xx) * 4; let r = p[s], g = p[s + 1], b = p[s + 2]; const a = p[s + 3];
      if (recolor) { const teal = g > r + 55 && g > 95; if (teal) { r = 94; g = 234; b = 212; } else { r = 255; g = 255; b = 255; } }
      im.data[t] = r; im.data[t + 1] = g; im.data[t + 2] = b; im.data[t + 3] = a; }
    ox.putImageData(im, 0, 0); return o; };
  const lw = right - left + 1 + pad * 2, lh = lockBottom - top + pad * 2, lx = left - pad, ly = top - pad;
  const mw = markRight - left + 1 + pad * 2;
  const out = {};
  const url = (cv) => cv.toDataURL("image/png").split(",")[1];
  out.logoLight = url(crop(lx, ly, lw, lh, false)); out.logoDark = url(crop(lx, ly, lw, lh, true));
  out.markLight = url(crop(lx, ly, mw, lh, false)); out.markDark = url(crop(lx, ly, mw, lh, true));
  // square icons: the mark centred on white with rounded corners
  const icon = (size, rounded) => { const o = document.createElement("canvas"); o.width = o.height = size; const ox = o.getContext("2d"); ox.fillStyle = "#ffffff";
    if (rounded) { ox.beginPath(); ox.roundRect(0, 0, size, size, size * 0.22); ox.fill(); } else ox.fillRect(0, 0, size, size);
    const m = crop(lx, ly, mw, lh, false); const k = (size * 0.78) / Math.max(mw, lh); const dw = mw * k, dh = lh * k; ox.drawImage(m, (size - dw) / 2, (size - dh) / 2, dw, dh); return url(o); };
  out.icon512 = icon(512, true); out.icon192 = icon(192, true); out.fav = icon(64, false);
  const small = (cv, h) => { const o = document.createElement("canvas"); o.height = h; o.width = Math.round(cv.width * h / cv.height); const ox = o.getContext("2d"); ox.imageSmoothingQuality = "high"; ox.drawImage(cv, 0, 0, o.width, o.height); return url(o); };
  out.markSmallDark = small(crop(lx, ly, mw, lh, true), 120);
  let allBottom = H - 1; while (allBottom > 0 && !row(allBottom)) allBottom--;
  const og = document.createElement("canvas"); og.width = 1200; og.height = 630; const gx = og.getContext("2d"); gx.fillStyle = "#ffffff"; gx.fillRect(0, 0, 1200, 630);
  const full = crop(lx, ly, lw, allBottom - ly + pad + 1, false); const k2 = Math.min(1000 / full.width, 470 / full.height); const gw = full.width * k2, gh = full.height * k2; gx.drawImage(full, (1200 - gw) / 2, (630 - gh) / 2, gw, gh);
  out.ogPng = og.toDataURL("image/png").split(",")[1]; out.ogJpg = og.toDataURL("image/jpeg", 0.92).split(",")[1];
  out.meta = { W, H, top, lockBottom, left, right, markRight, lw, lh, mw };
  return JSON.stringify(out);
})()`;
const res = await send("Runtime.evaluate", { expression: code, returnByValue: true, awaitPromise: true });
const val = res.result?.value;
if (!val) { console.log("FAILED", JSON.stringify(res).slice(0, 500)); process.exitCode = 1; }
else {
  const o = JSON.parse(val);
  const w = (n, k) => fs.writeFileSync(path.join(outDir, n), Buffer.from(o[k], "base64"));
  w("logo-light.png", "logoLight"); w("logo-dark.png", "logoDark"); w("mark-light.png", "markLight"); w("mark-dark.png", "markDark"); w("icon-512.png", "icon512"); w("icon-192.png", "icon192"); w("favicon.png", "fav"); w("mark-dark-120.png", "markSmallDark"); w("og-default.png", "ogPng"); w("og-default.jpg", "ogJpg");
  console.log(JSON.stringify(o.meta));
}
ws.close(); proc.kill();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
