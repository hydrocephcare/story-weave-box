// Tells Bing, Yandex and other IndexNow search engines about pages that are new or changed. Reads the live sitemaps; only pages whose lastmod is
// within the last 2 days are sent (all of them with --all, for the first run). Google reads the sitemap itself and does not use IndexNow.
const HOST = "www.ompathstudy.com";
const KEY = "6c6b3c3af0c96186d41fc96dc49ea13c";
const all = process.argv.includes("--all");
const since = Date.now() - 2 * 86_400_000;
const get = async (u) => { const r = await fetch(u, { headers: { "user-agent": "OmpathIndexNow/1.0" } }); if (!r.ok) throw new Error(u + " " + r.status); return r.text(); };
const index = await get(`https://${HOST}/sitemap.xml`);
const maps = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => !/library-sitemap/.test(u));
const urls = new Set();
for (const m of maps) {
  let xml = ""; try { xml = await get(m); } catch (e) { console.log("skip", m, String(e.message).slice(0, 60)); continue; }
  for (const b of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = /<loc>([^<]+)<\/loc>/.exec(b[1])?.[1]; const mod = /<lastmod>([^<]+)<\/lastmod>/.exec(b[1])?.[1];
    if (loc && (all || (mod && Date.parse(mod) >= since))) urls.add(loc);
  }
}
const list = [...urls];
console.log(list.length, "urls to send");
for (let i = 0; i < list.length; i += 9000) {
  const r = await fetch("https://api.indexnow.org/indexnow", { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: list.slice(i, i + 9000) }) });
  console.log("batch", i / 9000 + 1, r.status);
}
