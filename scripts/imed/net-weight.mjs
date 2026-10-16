// Loads a page in headless Chrome and lists how many bytes each Supabase request transferred (what counts against the egress quota).
//   node scripts/imed/net-weight.mjs <url> [waitMs]
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const url = process.argv[2], wait = Number(process.argv[3] || 12000);
const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const port = 9300 + Math.floor(Math.random() * 300);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "nw-"));
const proc = spawn(chrome, ["--headless=new", "--disable-gpu", `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let list; for (let i = 0; i < 40; i++) { try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (list.length) break; } catch { /* not up */ } await sleep(300); }
const ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); const reqs = new Map(); const rows = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result ?? d.error); pending.delete(d.id); return; }
  if (d.method === "Network.requestWillBeSent") reqs.set(d.params.requestId, { url: d.params.request.url, method: d.params.request.method });
  if (d.method === "Network.loadingFinished") { const r = reqs.get(d.params.requestId); if (r) rows.push({ ...r, bytes: d.params.encodedDataLength }); }
};
const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
await send("Network.enable"); await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Page.addScriptToEvaluateOnNewDocument", { source: "Object.defineProperty(navigator,'webdriver',{get:()=>false})" });
await send("Page.navigate", { url }); await sleep(wait);
const sb = rows.filter((r) => /supabase\.co/.test(r.url));
const total = sb.reduce((n, r) => n + r.bytes, 0);
console.log(`${url}\n  Supabase requests: ${sb.length}, total ${(total / 1024).toFixed(0)} KB (whole page: ${(rows.reduce((n, r) => n + r.bytes, 0) / 1024).toFixed(0)} KB)`);
for (const r of sb.sort((a, b) => b.bytes - a.bytes).slice(0, 6)) console.log(`   ${(r.bytes / 1024).toFixed(0).padStart(6)} KB  ${r.method} ${r.url.replace(/^https:\/\/[^/]+/, "").slice(0, 150)}`);
ws.close(); proc.kill(); try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
