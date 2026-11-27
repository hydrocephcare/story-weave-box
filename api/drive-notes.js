const DEFAULT_FOLDER = "1Fu3jR4bXo5zVusux-umgAXOb4Yi3qz_o";
const TTL = 5 * 60 * 1000;
let cached = null;

const decode = (value) => String(value || "")
  .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
  .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

const textOf = (html) => decode(String(html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());

export function kindOf(name, mime = "") {
  const n = String(name || "").toLowerCase();
  const m = String(mime || "").toLowerCase();
  if (/\.pdf$/.test(n) || m === "application/pdf") return "pdf";
  if (/\.(ppt|pptx|odp)$/.test(n) || /presentation/.test(m)) return "ppt";
  if (/\.(doc|docx|odt|rtf)$/.test(n) || /wordprocessing|msword|opendocument\.text/.test(m)) return "doc";
  if (/\.(mp4|mov|webm|m4v|avi)$/.test(n) || m.startsWith("video/")) return "video";
  if (/\.(png|jpe?g|gif|webp|svg|heic)$/.test(n) || m.startsWith("image/")) return "img";
  if (/\.(zip|rar|7z)$/.test(n) || /zip|compressed/.test(m)) return "zip";
  return "file";
}

export function parseFolder(html) {
  const source = String(html || "");
  const title = textOf(source.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "Google Drive folder");
  const items = [];
  const entryRe = /<div\b(?=[^>]*\bclass\s*=\s*["'][^"']*\bflip-entry\b)(?=[^>]*\bid\s*=\s*["']entry-([^"']+)["'])[^>]*>([\s\S]*?)(?=<div\b(?=[^>]*\bclass\s*=\s*["'][^"']*\bflip-entry\b)|<\/body\s*>|$)/gi;
  let match;
  while ((match = entryRe.exec(source))) {
    const entryId = decode(match[1]);
    const body = match[2] || "";
    const href = decode(body.match(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/i)?.[1] || "");
    const name = textOf(body.match(/<div\b[^>]*class\s*=\s*["'][^"']*flip-entry-title[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || "");
    if (!name) continue;
    const folder = /\/drive\/folders\//i.test(href) || /^FOLD/i.test(entryId);
    const hrefId = folder
      ? href.match(/\/folders\/([^/?#]+)/i)?.[1]
      : href.match(/\/d\/([^/?#]+)/i)?.[1] || href.match(/[?&]id=([^&#]+)/i)?.[1];
    const id = decode(hrefId || entryId);
    const mime = folder ? "folder" : decode(body.match(/drive-thirdparty\.googleusercontent\.com\/\d+\/type\/([^"'?&]+)/i)?.[1] || "");
    const modified = textOf(body.match(/flip-entry-last-modified[^>]*>[\s\S]*?<div[^>]*>([\s\S]*?)<\/div>/i)?.[1] || "");
    items.push({ id, name, mime, modified });
  }
  return { title, items };
}

async function fetchFolder(id) {
  const url = "https://drive.google.com/embeddedfolderview?id=" + encodeURIComponent(id);
  const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 OmpathStudy/1.0", accept: "text/html" }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) {
    const error = new Error("Google Drive returned HTTP " + response.status);
    error.status = response.status;
    throw error;
  }
  return parseFolder(await response.text());
}

async function crawl(id, name, depth, state) {
  const page = await fetchFolder(id);
  const node = { id, name: name || page.title || "Folder", folders: [], files: [] };
  for (const item of page.items) {
    if (item.mime === "folder") {
      if (depth >= 5) { state.partial = true; continue; }
      try {
        node.folders.push(await crawl(item.id, item.name, depth + 1, state));
      } catch (error) {
        state.partial = true;
        console.warn("[drive-notes] Skipped folder", item.id, error instanceof Error ? error.message : String(error));
      }
    } else {
      node.files.push({ id: item.id, name: item.name, kind: kindOf(item.name, item.mime), modified: item.modified || "" });
    }
  }
  return node;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600, stale-while-revalidate=3600");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ ok: false, reason: "unavailable", message: "GET only." });
  if (cached && Date.now() - cached.at < TTL) return res.status(200).json(cached.data);
  const folder = String(process.env.DRIVE_NOTES_FOLDER || DEFAULT_FOLDER).trim();
  try {
    const state = { partial: false };
    const tree = await crawl(folder, "", 0, state);
    const data = { ok: true, updated: new Date().toISOString(), partial: state.partial, tree };
    cached = { at: Date.now(), data };
    return res.status(200).json(data);
  } catch (error) {
    const status = Number(error?.status || 0);
    const reason = status === 404 ? "missing" : status === 401 || status === 403 ? "private" : "unavailable";
    res.setHeader("Cache-Control", "no-store");
    return res.status(status === 404 ? 404 : 503).json({
      ok: false,
      reason,
      message: reason === "private" ? "The Google Drive folder must be shared with anyone who has the link." : reason === "missing" ? "The Google Drive notes folder could not be found." : "The Google Drive notes folder is temporarily unavailable.",
    });
  }
}
