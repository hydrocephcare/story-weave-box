/**
 * OmpathStudy read-only verification dashboard.
 * Safe public checks only. Never initiates payments or changes user access.
 */
const ORIGIN = "https://www.ompathstudy.com";
const CHECKS = [
  { name: "Production homepage", path: "/" },
  { name: "Robots policy", path: "/robots.txt" },
  { name: "XML sitemap", path: "/sitemap.xml" },
  { name: "Sitemap index", path: "/sitemap-index.xml" },
];

async function runChecks() {
  const results = await Promise.all(CHECKS.map(async (check) => {
    const started = Date.now();
    try {
      const response = await fetch(ORIGIN + check.path, {
        method: "GET",
        redirect: "follow",
        headers: { "user-agent": "OmpathStudy-ReadOnly-Monitor/1.0" },
        signal: AbortSignal.timeout(12000),
      });
      return {
        name: check.name,
        path: check.path,
        status: response.status,
        ok: response.ok,
        durationMs: Date.now() - started,
        finalUrl: response.url,
        contentType: response.headers.get("content-type") || "",
      };
    } catch (error) {
      return {
        name: check.name,
        path: check.path,
        ok: false,
        error: String(error?.message || error),
        durationMs: Date.now() - started,
      };
    }
  }));
  return {
    checkedAt: new Date().toISOString(),
    target: ORIGIN,
    results,
    paymentSafety: "No payment was initiated. Paystack checkout and webhook require a controlled test transaction.",
    note: "This dashboard performs read-only public endpoint checks. It does not inspect secrets or modify production data.",
  };
}

function page() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>OmpathStudy | Verification</title>
<style>
:root{color-scheme:dark;font-family:Inter,system-ui,sans-serif;background:#0b1020;color:#e8edf8}
*{box-sizing:border-box}body{margin:0;padding:32px 18px;background:radial-gradient(circle at top,#172849,#0b1020 55%);min-height:100vh}
main{max-width:900px;margin:auto}.eyebrow{color:#8db8ff;font-size:12px;letter-spacing:.14em;text-transform:uppercase;font-weight:700}
h1{font-size:clamp(27px,5vw,40px);margin:10px 0}p{color:#aebbd0;line-height:1.6}
.panel{background:#111a2e;border:1px solid #263653;border-radius:16px;padding:20px;margin:18px 0}
.actions{display:flex;gap:10px;flex-wrap:wrap}button{border:0;border-radius:10px;padding:12px 18px;background:#3978e8;color:white;font-weight:700;cursor:pointer}
button.secondary{background:#24334e;color:#e8edf8}.status{display:inline-block;padding:5px 9px;border-radius:20px;font-size:12px;font-weight:700;background:#263653}
.pass{background:#123d32;color:#7ce0b7}.fail{background:#4b202b;color:#ff9aab}.pending{color:#d6c38a}
.item{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 0;border-bottom:1px solid #25324a}.item:last-child{border:0}
small,.muted{color:#91a0b8}.foot{font-size:12px;margin-top:24px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}.metric{background:#0d1527;padding:14px;border-radius:12px}.metric strong{display:block;font-size:22px;margin-top:6px}
a{color:#8db8ff}
</style></head><body><main>
<div class="eyebrow">OmpathStudy · Operations</div><h1>Verification dashboard</h1>
<p>Read-only checks for the live website. This dashboard does not initiate payments, unlock accounts, or change production data.</p>
<div class="panel"><div class="actions"><button id="run">Run checks</button><button class="secondary" id="refresh">Refresh page</button></div>
<p id="updated" class="muted">Not yet checked.</p><div class="grid" id="metrics"></div><div id="results"></div></div>
<div class="panel"><h2>Payment workflow</h2>
<div class="item"><span>Paystack secret configured in Vercel</span><span class="status pending">Value not inspected</span></div>
<div class="item"><span>Transaction initiation and verification</span><span class="status pending">Not tested</span></div>
<div class="item"><span>Webhook signature and duplicate-event handling</span><span class="status pending">Not tested</span></div>
<div class="item"><span>Neon payment record and access grant</span><span class="status pending">Not tested</span></div>
<p class="foot">To complete these checks safely, use Paystack test credentials and a controlled test user. Do not run a live charge as a health check.</p></div>
<div class="panel"><h2>Important workflow coverage</h2>
<div class="item"><span>Authentication and session persistence</span><span class="status pending">Requires browser test</span></div>
<div class="item"><span>Admin publishing and media upload</span><span class="status pending">Requires authorized test</span></div>
<div class="item"><span>MCQ / flashcard access control</span><span class="status pending">Requires test account</span></div>
<div class="item"><span>SEO rendering and canonical metadata</span><span class="status pending">Requires page-level audit</span></div></div>
<p class="foot">Production target: <a href="https://www.ompathstudy.com" target="_blank" rel="noreferrer">www.ompathstudy.com</a> · Verification worker is separate from the main application.</p>
</main>
<script>
const run=document.querySelector('#run'), results=document.querySelector('#results'), updated=document.querySelector('#updated'), metrics=document.querySelector('#metrics');
async function check(){run.disabled=true;run.textContent='Checking…';results.innerHTML='';try{const r=await fetch('/api/check');const data=await r.json();const ok=data.results.filter(x=>x.ok).length;metrics.innerHTML='<div class="metric"><small>Passed</small><strong>'+ok+'/'+data.results.length+'</strong></div><div class="metric"><small>Failed</small><strong>'+(data.results.length-ok)+'</strong></div><div class="metric"><small>Target</small><strong style="font-size:14px">Production</strong></div>';updated.textContent='Last checked: '+new Date(data.checkedAt).toLocaleString();results.innerHTML=data.results.map(x=>'<div class="item"><div><strong>'+x.name+'</strong><br><small>'+x.path+' · '+(x.durationMs||0)+' ms</small></div><span class="status '+(x.ok?'pass':'fail')+'">'+(x.ok?'HTTP '+x.status:'FAILED '+(x.status||''))+'</span></div>').join('');}catch(e){results.textContent='Unable to run checks: '+e.message;}finally{run.disabled=false;run.textContent='Run checks';}}
run.addEventListener('click',check);document.querySelector('#refresh').addEventListener('click',()=>location.reload());check();
</script></body></html>`;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/api/check") {
      const data = await runChecks();
      return Response.json(data, { headers: { "cache-control": "no-store" } });
    }
    if (url.pathname === "/_health") {
      return Response.json({ ok: true, service: "ompathstudy-verification", mode: "read-only" });
    }
    return new Response(page(), {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  },
};
