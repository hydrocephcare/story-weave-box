// Headless Chrome walk-through with screenshots.  node scripts/imed/shots.mjs <plan.json>
// plan: { url, width, height, dark, preload: "js run before the page loads", steps: [ {wait: ms} | {click: "button text"} | {scroll: px} | {scrollTo: "css selector"} | {shot: "file.png"} | {eval: "js"} | {text: "css selector"} ] }
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const plan = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const port = 9700 + Math.floor(Math.random() * 200);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "shots-"));
const proc = spawn(chrome, ["--headless=new", "--disable-gpu", `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let list;
for (let i = 0; i < 40; i++) { try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (list.length) break; } catch { /* not up yet */ } await sleep(300); }
const ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result ?? d.error); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const ev = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.value;
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: plan.width ?? 1280, height: plan.height ?? 900, deviceScaleFactor: 1, mobile: Boolean(plan.mobile) });
if (plan.dark) await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
if (plan.preload) await send("Page.addScriptToEvaluateOnNewDocument", { source: plan.preload });
await send("Page.navigate", { url: plan.url });
for (const st of plan.steps) {
  if (st.wait) await sleep(st.wait);
  else if (st.click) console.log("click", JSON.stringify(st.click), await ev(`(() => { const t = ${JSON.stringify(st.click)}; const els = [...document.querySelectorAll('button, a, [role=tab]')].filter((e) => (e.textContent || '').trim().toLowerCase().includes(t.toLowerCase())); if (!els.length) return 'NOT FOUND'; els[0].click(); return 'clicked ' + els.length; })()`));
  else if (st.scroll !== undefined) await ev(`document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo({ top: ${Number(st.scroll)}, behavior: 'instant' })`);
  else if (st.scrollTo) console.log("scrollTo", await ev(`(() => { const e = document.querySelector(${JSON.stringify(st.scrollTo)}); if (!e) return 'NOT FOUND'; document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo({ top: e.getBoundingClientRect().top + window.scrollY - 70, behavior: 'instant' }); return 'ok'; })()`));
  else if (st.eval) console.log("eval", JSON.stringify(await ev(st.eval)));
  else if (st.text) console.log("text", JSON.stringify((await ev(`(document.querySelector(${JSON.stringify(st.text)})?.innerText || 'NOT FOUND').slice(0, 1500)`))));
  else if (st.shot) { const r = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(st.shot, Buffer.from(r.data, "base64")); console.log("saved", st.shot); }
}
ws.close(); proc.kill();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
