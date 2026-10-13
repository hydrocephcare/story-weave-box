// Free pictures for a topic page, found online when a reader opens it: the lead picture of the Wikipedia article (with its short
// description) plus a few more figures from that article, all from Wikimedia Commons with their licence and author shown.
// No AI and no cost. Results are remembered on the device for a month, and nothing here may break the page: every failure returns null.
import { useEffect, useState } from "react";

export interface WebImage { u: string; full: string; title: string; credit: string; licence: string; page: string }
export interface WebMedia { title: string; description: string; extract: string; intro: string; sections: { h: string; p: string[] }[]; url: string; hero: WebImage | null; more: WebImage[] }

const API = "https://en.wikipedia.org/w/api.php";
const CACHE = "ompath_webmedia_v3";
const DAY = 86_400_000;
const SKIP_FILE = /icon|logo|symbol|ambox|flag|commons-|wikidata|wikiquote|wiktionary|edit-|stub|portal|question|disambig|padlock|folder|nuvola|crystal|office-book|speaker|loudspeaker|button|arrow|red_pencil|merge|increase|decrease|steady|pictogram|map_of|\.ogg|\.ogv|\.webm|\.tif|\.pdf/i;
const OK_LICENCE = /^(cc[- ]|public domain|pd|attribution|gfdl)/i;

const strip = (h: string) => h.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#039;|&quot;/g, "'").replace(/\s+/g, " ").trim();

async function json<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  return r.json() as Promise<T>;
}

type Page = { title: string; fullurl?: string; description?: string; extract?: string; thumbnail?: { source: string }; original?: { source: string }; pageprops?: { disambiguation?: string } };

/** The opening two sentences, cut at a sentence end. */
function shortExtract(t: string): string {
  const clean = t.replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
  const sentences = clean.match(/[^.!?]+[.!?]+(?=\s|$)/g) ?? [clean];
  let out = "";
  for (const s of sentences.slice(0, 2)) { if ((out + s).length > 420 && out) break; out += s; }
  return (out || clean).trim().slice(0, 420);
}

/** The whole opening of the article as short paragraphs (blank-line separated), without pronunciation brackets. */
function introText(t: string): string {
  const paras = t.split(/\n+/).map((p) => p.replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim()).filter((p) => p.length > 40);
  let out = "";
  for (const p of paras) { if (out && (out + p).length > 1700) break; out += (out ? "\n" : "") + p; }
  return out;
}

const DROP_HEADING = /^(references?|see also|external links?|further reading|notes?|bibliography|citations?|sources?|gallery|additional images|history|etymology|in popular culture)$/i;

/** Splits a plain-text Wikipedia article ("== Heading ==") into readable sections, skipping the back matter. */
function articleSections(full: string): { h: string; p: string[] }[] {
  const out: { h: string; p: string[] }[] = [];
  const parts = full.split(/^={2,}\s*(.+?)\s*={2,}\s*$/m);
  for (let i = 1; i < parts.length; i += 2) {
    const h = parts[i].trim();
    if (DROP_HEADING.test(h)) continue;
    const paras = parts[i + 1].split(/\n+/).map((p) => p.replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim()).filter((p) => p.length > 50);
    let used = 0; const keep: string[] = [];
    for (const p of paras) { if (keep.length && used + p.length > 1500) break; keep.push(p); used += p.length; }
    if (keep.length) out.push({ h, p: keep });
  }
  return out.slice(0, 7);
}

async function findArticle(names: string[]): Promise<Page | null> {
  for (const name of names) {
    try {
      const q = new URLSearchParams({ action: "query", format: "json", origin: "*", redirects: "1", titles: name, prop: "pageimages|extracts|info|description|pageprops", piprop: "thumbnail|original", pithumbsize: "900", exintro: "1", explaintext: "1", inprop: "url" });
      const j = await json<{ query?: { pages?: Record<string, Page & { missing?: string }> } }>(`${API}?${q}`);
      const p = Object.values(j.query?.pages ?? {})[0];
      if (p && !("missing" in p) && !p.pageprops?.disambiguation && p.extract && !/may refer to/i.test(p.extract.slice(0, 160))) return p;
    } catch { /* try the next name */ }
  }
  return null;
}

async function describeFiles(titles: string[]): Promise<WebImage[]> {
  if (!titles.length) return [];
  const q = new URLSearchParams({ action: "query", format: "json", origin: "*", titles: titles.join("|"), prop: "imageinfo", iiprop: "url|extmetadata|size|mime", iiurlwidth: "700", iiextmetadatafilter: "LicenseShortName|Artist|ImageDescription|ObjectName" });
  const j = await json<{ query?: { pages?: Record<string, { title: string; imageinfo?: { thumburl?: string; url: string; descriptionurl: string; width: number; height: number; mime?: string; extmetadata?: Record<string, { value: string }> }[] }> } }>(`${API}?${q}`);
  const out: WebImage[] = [];
  for (const p of Object.values(j.query?.pages ?? {})) {
    const i = p.imageinfo?.[0];
    if (!i || !/^image\/(jpeg|png|svg)/.test(i.mime ?? "") || i.width < 300 || i.height < 200) continue;
    const licence = strip(i.extmetadata?.LicenseShortName?.value ?? "");
    if (!OK_LICENCE.test(licence)) continue;
    const title = strip(i.extmetadata?.ImageDescription?.value ?? "") || p.title.replace(/^File:/, "").replace(/\.[a-z]+$/i, "").replace(/_/g, " ");
    out.push({ u: i.thumburl ?? i.url, full: i.url, title: title.slice(0, 140), credit: strip(i.extmetadata?.Artist?.value ?? "Wikimedia Commons").slice(0, 80), licence, page: i.descriptionurl });
  }
  return out;
}

export async function loadWebMedia(names: string[]): Promise<WebMedia | null> {
  const key = names[0]?.toLowerCase();
  if (!key) return null;
  try {
    const all = JSON.parse(localStorage.getItem(CACHE) ?? "{}") as Record<string, { at: number; v: WebMedia | null }>;
    const hit = all[key];
    if (hit && Date.now() - hit.at < 30 * DAY) return hit.v;
  } catch { /* storage blocked */ }

  let result: WebMedia | null = null;
  try {
    const article = await findArticle(names);
    if (article) {
      const q = new URLSearchParams({ action: "query", format: "json", origin: "*", titles: article.title, prop: "images", imlimit: "40" });
      const q0 = new URLSearchParams({ action: "query", format: "json", origin: "*", titles: article.title, prop: "extracts", explaintext: "1", exsectionformat: "wiki" });
      const fullArticle = await json<{ query?: { pages?: Record<string, { extract?: string }> } }>(`${API}?${q0}`).catch(() => null);
      const fullPage = Object.values(fullArticle?.query?.pages ?? {})[0] as { extract?: string } | undefined;
      const sections = articleSections(fullPage?.extract ?? "");
      const imgs = await json<{ query?: { pages?: Record<string, { images?: { title: string }[] }> } }>(`${API}?${q}`).catch(() => null);
      const first = Object.values(imgs?.query?.pages ?? {})[0] as { images?: { title: string }[] } | undefined;
      const words = article.title.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
      // Wikipedia reuses stock pictures of neighbouring conditions; keep those only when the file name mentions this topic
      const files = (first?.images ?? []).map((x) => x.title).filter((t) => !SKIP_FILE.test(t) && (!/blausen|medical gallery/i.test(t) || words.some((w) => t.toLowerCase().includes(w))));
      const lead = article.original?.source ? article.original.source.split("/").pop() : "";
      const gallery = await describeFiles(files.slice(0, 14)).catch(() => []);
      const heroSrc = article.thumbnail?.source ?? null;
      const heroFile = gallery.find((g) => lead && decodeURIComponent(g.full).includes(decodeURIComponent(lead)));
      const hero: WebImage | null = heroFile ?? (heroSrc ? { u: heroSrc, full: article.original?.source ?? heroSrc, title: article.title, credit: "Wikimedia Commons", licence: "see file page", page: article.fullurl ?? "https://commons.wikimedia.org" } : null);
      result = {
        title: article.title,
        description: article.description ?? "",
        extract: shortExtract(article.extract ?? ""),
        intro: introText(article.extract ?? ""),
        sections,
        url: article.fullurl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(article.title)}`,
        hero,
        more: gallery.filter((g) => g.full !== hero?.full).slice(0, 6),
      };
    } else {
      // no Wikipedia article: search Wikimedia Commons directly so the page is never without pictures
      const q = new URLSearchParams({ action: "query", format: "json", origin: "*", list: "search", srnamespace: "6", srsearch: `${names[0]} medical`, srlimit: "12" });
      const found = await json<{ query?: { search?: { title: string }[] } }>(`https://commons.wikimedia.org/w/api.php?${q}`).catch(() => null);
      const titles = (found?.query?.search ?? []).map((x) => x.title).filter((t) => !SKIP_FILE.test(t)).slice(0, 10);
      const q2 = new URLSearchParams({ action: "query", format: "json", origin: "*", titles: titles.join("|"), prop: "imageinfo", iiprop: "url|extmetadata|size|mime", iiurlwidth: "700", iiextmetadatafilter: "LicenseShortName|Artist|ImageDescription" });
      const info = titles.length ? await json<{ query?: { pages?: Record<string, { title: string; imageinfo?: { thumburl?: string; url: string; descriptionurl: string; width: number; height: number; mime?: string; extmetadata?: Record<string, { value: string }> }[] }> } }>(`https://commons.wikimedia.org/w/api.php?${q2}`).catch(() => null) : null;
      const pics: WebImage[] = [];
      type FilePage = { title: string; imageinfo?: { thumburl?: string; url: string; descriptionurl: string; width: number; height: number; mime?: string; extmetadata?: Record<string, { value: string }> }[] };
      for (const p of Object.values(info?.query?.pages ?? {}) as FilePage[]) {
        const i = p.imageinfo?.[0];
        const licence = strip(i?.extmetadata?.LicenseShortName?.value ?? "");
        if (!i || !/^image\/(jpeg|png)/.test(i.mime ?? "") || i.width < 300 || !OK_LICENCE.test(licence)) continue;
        pics.push({ u: i.thumburl ?? i.url, full: i.url, title: (strip(i.extmetadata?.ImageDescription?.value ?? "") || p.title.replace(/^File:/, "").replace(/\.[a-z]+$/i, "").replace(/_/g, " ")).slice(0, 140), credit: strip(i.extmetadata?.Artist?.value ?? "Wikimedia Commons").slice(0, 80), licence, page: i.descriptionurl });
      }
      if (pics.length) result = { title: names[0], description: "", extract: "", intro: "", sections: [], url: "https://commons.wikimedia.org", hero: pics[0], more: pics.slice(1, 7) };
    }
  } catch { result = null; }

  try {
    const all = JSON.parse(localStorage.getItem(CACHE) ?? "{}") as Record<string, unknown>;
    const keys = Object.keys(all);
    if (keys.length > 60) delete all[keys[0]];
    all[key] = { at: Date.now(), v: result };
    localStorage.setItem(CACHE, JSON.stringify(all));
  } catch { /* storage blocked or full */ }
  return result;
}

/** Pictures and a short description for a topic, found online. null while loading or when nothing suitable exists. */
export function useWebMedia(name: string, aka: string[] = [], enabled = true): WebMedia | null {
  const [media, setMedia] = useState<WebMedia | null>(null);
  const names = [name, ...aka.filter((a) => a.length > 3)].slice(0, 3);
  const k = names.join("|");
  useEffect(() => {
    let on = true;
    setMedia(null);
    if (!enabled || !name) return;
    void loadWebMedia(names).then((m) => on && setMedia(m));
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, enabled]);
  return media;
}
