// Opens a URL in headless Chrome and prints every console error / uncaught exception / failed request, so a blank page can be explained.
//   node scripts/imed/console-errors.mjs <url> [waitMs]
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const url = process.argv[2], wait = Number(process.argv[3] || 9000);
const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const port = 9300 + Math.floor(Math.random() * 300);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ce-"));
const proc = spawn(chrome, ["--headless=new", "--disable-gpu", `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let list; for (let i = 0; i < 40; i++) { try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (list.length) break; } catch { /* not up */ } await sleep(300); }
const ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
const out = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result ?? d.error); pending.delete(d.id); return; }
  if (d.method === "Runtime.exceptionThrown") out.push("EXCEPTION: " + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text).slice(0, 400));
  if (d.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(d.params.type)) out.push(`console.${d.params.type}: ` + d.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300));
  if (d.method === "Network.loadingFailed") out.push("REQUEST FAILED: " + (d.params.errorText || "") + " " + (d.params.blockedReason || ""));
  if (d.method === "Network.responseReceived" && d.params.response.status >= 400) out.push(`HTTP ${d.params.response.status}: ${d.params.response.url.slice(0, 150)}`);
};
const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
await send("Runtime.enable"); await send("Network.enable"); await send("Log.enable");
await send("Page.addScriptToEvaluateOnNewDocument", { source: "Object.defineProperty(navigator,'webdriver',{get:()=>false})" });
await send("Page.navigate", { url }); await sleep(wait);
const len = await send("Runtime.evaluate", { expression: "document.body.innerText.length", returnByValue: true });
console.log("visible text length:", len.result?.value);
console.log([...new Set(out)].slice(0, 25).join("\n") || "no errors captured");
ws.close(); proc.kill(); try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
