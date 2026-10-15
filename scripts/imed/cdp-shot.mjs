// Opens a page in headless Chrome at a chosen width and root font size, reports how wide the page really is, and saves a screenshot.
//   node scripts/imed/cdp-shot.mjs <url> <width> <rootFontPx> <out.png> [dark]
import { spawn } from "node:child_process";
import fs from "node:fs";

const [url, width = "1280", fontPx = "16", out = "shot.png", mode = "", scrollY = "0"] = process.argv.slice(2);
const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const port = 9400 + Math.floor(Math.random() * 300);
const proc = spawn(chrome, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let list;
for (let i = 0; i < 40; i++) { try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (list.length) break; } catch { /* not up yet */ } await sleep(300); }
const ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result ?? d.error); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: Number(width), height: 900, deviceScaleFactor: 1, mobile: false });
if (mode === "dark") await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
await send("Page.navigate", { url });
await sleep(9000);
await send("Runtime.evaluate", { expression: `document.documentElement.style.fontSize='${fontPx}px'` });
await send("Runtime.evaluate", { expression: `window.scrollTo(0, ${Number(scrollY)})` });
await sleep(1500);
const m = await send("Runtime.evaluate", { returnByValue: true, expression: `(() => { const w = document.documentElement.clientWidth; const wide = [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > w + 2).slice(0, 8).map((e) => e.tagName + '.' + String(e.className).slice(0, 60) + ' right=' + Math.round(e.getBoundingClientRect().right)); return JSON.stringify({ viewport: w, scrollWidth: document.documentElement.scrollWidth, bodyScroll: document.body.scrollWidth, wide }); })()` });
console.log(m.result?.value);
const shot = await send("Page.captureScreenshot", { format: "png" });
fs.writeFileSync(out, Buffer.from(shot.data, "base64"));
ws.close(); proc.kill();
