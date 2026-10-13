// Opens real pages of the live site in a headless browser (phone and desktop width) and fails if any page is broken:
// script errors, failed requests, text that never appeared, horizontal overflow, a missing title or description.
// Run by .github/workflows/site-audit.yml after every deploy and every morning. Locally:
//   node scripts/audit/site-audit.mjs https://www.ompathstudy.com
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const base = (process.argv[2] || "https://www.ompathstudy.com").replace(/\/$/, "");
const CHROME = process.env.CHROME_PATH || (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "google-chrome");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// today's sample of topics (different every day), plus the pages everyone uses
const day = Math.floor(Date.now() / 86_400_000);
let topics = [];
try {
  const index = await (await fetch(`${base}/topics/index.json`)).json();
  const pick = (n, off) => Array.from({ length: n }, (_, i) => index[(day * 37 + off + i * 97) % index.length]);
  topics = [...pick(8, 0), ...index.filter((t) => t.ai).slice(0, 4)].map((t) => `/topic/${t.s}`);
} catch { topics = ["/topic/trachea"]; }
const routes = ["/", "/topics", "/year/1", "/year/4", "/notes", "/flashcards", "/about-us", ...topics];

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "audit-"));
const port = 9300 + Math.floor(Math.random() * 90);
const chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
let wsUrl;
for (let i = 0; i < 40 && !wsUrl; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page")?.webSocketDebuggerUrl; } catch { /* still starting */ } if (!wsUrl) await sleep(500); }
if (!wsUrl) { console.error("Could not start the browser."); process.exit(2); }
const ws = new WebSocket(wsUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); let errors = [], failed = [];
const IGNORE = /supabase|googleapis|gstatic|favicon|wikipedia|wikimedia|google|doubleclick|googletagmanager|cloudflare/i;
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result ?? msg.error); pending.delete(msg.id); return; }
  if (msg.method === "Runtime.exceptionThrown") errors.push("EXC " + String(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text).slice(0, 140));
  if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
    const text = msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ");
    if (!IGNORE.test(text) && !/Failed to load resource/.test(text)) errors.push("CONSOLE " + text.slice(0, 160));
  }
  if (msg.method === "Network.responseReceived") { const r = msg.params.response; if (r.status >= 400 && !IGNORE.test(r.url)) failed.push(`${r.status} ${r.url.slice(0, 110)}`); }
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");

const probe = `(() => { const de = document.documentElement; const w = innerWidth; const bad = [];
  for (const el of document.querySelectorAll("body *")) { const r = el.getBoundingClientRect(); if (r.width > 0 && r.right > w + 2 && getComputedStyle(el).position !== "fixed" && !el.closest("[data-radix-popper-content-wrapper],.sr-only,[aria-hidden=true],[data-peek-scroll]")) { bad.push(el.tagName.toLowerCase() + "." + String(el.className).slice(0, 40)); if (bad.length > 2) break; } }
  const meta = (n) => document.querySelector('meta[name="' + n + '"],meta[property="' + n + '"]')?.content ?? "";
  const body = document.body.innerText;
  return JSON.stringify({ over: de.scrollWidth > w + 2, bad, title: document.title, desc: meta("description").length, h1: document.querySelectorAll("h1").length, text: body.length, broken: /something went wrong|unexpected error|failed to fetch dynamically/i.test(body), skeleton: document.querySelectorAll(".animate-pulse").length }); })()`;

const bad = [];
for (const route of routes) for (const [label, W, H, mobile] of [["phone", 390, 800, true], ["desk", 1366, 800, false]]) {
  errors = []; failed = [];
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile });
  await send("Page.navigate", { url: base + route });
  await sleep(6500);
  const r = await send("Runtime.evaluate", { expression: probe, returnByValue: true });
  let p; try { p = JSON.parse(r.result.value); } catch { p = { err: true }; }
  const flags = [];
  if (p.err) flags.push("page did not respond");
  else {
    if (p.over) flags.push(`sideways overflow [${p.bad.join("; ")}]`);
    if (!p.title || /^\s*$/.test(p.title)) flags.push("no title");
    if (!p.desc) flags.push("no description");
    if (p.h1 < 1) flags.push("no heading");
    if (p.broken) flags.push("shows an error message");
    if (p.text < (route.startsWith("/topic/") ? 700 : 300)) flags.push(`almost empty (${p.text} characters)`);
    if (route.startsWith("/topic/") && p.skeleton > 2) flags.push("still showing placeholders");
  }
  const ex = [...new Set(errors)].slice(0, 2); if (ex.length) flags.push(`errors: ${ex.join(" | ")}`);
  const fx = [...new Set(failed)].slice(0, 2); if (fx.length) flags.push(`failed requests: ${fx.join(" | ")}`);
  console.log(`${flags.length ? "FAIL" : "ok  "} ${label.padEnd(5)} ${route.padEnd(46)} ${flags.join("  ")}`);
  if (flags.length) bad.push(`${label} ${route}: ${flags.join("; ")}`);
}
ws.close(); chrome.kill();
if (bad.length) { console.error(`\n${bad.length} problem(s):\n- ${bad.join("\n- ")}`); process.exit(1); }
console.log(`\nAll ${routes.length * 2} checks passed.`);
process.exit(0);
