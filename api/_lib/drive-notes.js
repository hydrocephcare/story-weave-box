// Live copy of the notes folder on Google Drive. Whatever is in the folder right now is what the site shows: add a file in Drive and it appears
// on /new-notes (and in search and Ompath AI) within a few minutes, with no upload and no deploy.
//
// The folder must be shared as "Anyone with the link can view". The listing is read the same way scripts/library/crawl-drive-folder.cjs does it,
// then cached at the edge for 5 minutes so Drive is hit at most a few times an hour however many students visit.
const FOLDER = process.env.DRIVE_NOTES_FOLDER || "1Fu3jR4bXo5zVusux-umgAXOb4Yi3qz_o";
const MAX_DEPTH = 5;
const MAX_FOLDERS = 80;
const BUDGET_MS = 8000;

const dec = (s) => s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

/** One embedded-folder page: its title and the files and sub-folders in it. */
export function parseFolder(html) {
  const title = dec((html.match(/<title>([^<]*)<\/title>/) || [])[1] || "");
  const items = [];
  for (const p of html.split('<div class="flip-entry" id="entry-').slice(1)) {
    const id = p.slice(0, p.indexOf('"'));
    const isFolder = /href="https:\/\/drive\.google\.com\/drive\/folders\//.test(p.slice(0, 400));
    const name = dec(((p.match(/class="flip-entry-title">([^<]*)</) || [])[1] || "").trim());
    const mime = isFolder ? "folder" : decodeURIComponent((p.match(/drive-thirdparty\.googleusercontent\.com\/\d+\/type\/([^"]+)"/) || [])[1] || "application/octet-stream");
    const modified = dec(((p.match(/flip-entry-last-modified"><div>([^<]*)</) || [])[1] || "").trim());
    if (id && name) items.push({ id, name, mime, modified });
  }
  return { title, items };
}

const ext = (n) => (n.split(".").pop() || "").toLowerCase();
export function kindOf(name, mime) {
  const e = ext(name);
  if (/pdf/.test(mime) || e === "pdf") return "pdf";
  if (/presentation|powerpoint/.test(mime) || ["ppt", "pptx", "pps", "ppsx", "pptm"].includes(e)) return "ppt";
  if (/word|msword|document/.test(mime) || ["doc", "docx", "rtf", "txt", "odt"].includes(e)) return "doc";
  if (/^video\//.test(mime) || ["mp4", "wmv", "avi", "mkv", "mov"].includes(e)) return "video";
  if (/^image\//.test(mime) || ["jpg", "jpeg", "png", "gif", "webp"].includes(e)) return "img";
  if (/zip|rar/.test(mime) || ["zip", "rar", "7z"].includes(e)) return "zip";
  return "file";
}
const isJunk = (name, mime) => /shortcut/.test(mime) || ["lnk", "ini", "db", "tmp", "url", "ds_store"].includes(ext(name)) || /^(thumbs\.db|desktop\.ini|~\$)/i.test(name);

async function listFolder(id) {
  const res = await fetch(`https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(id)}`, { headers: { "user-agent": "Mozilla/5.0" } });
  if (res.status === 401 || res.status === 403 || res.status === 404) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e; }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseFolder(await res.text());
}

async function crawl(id, name, depth, state) {
  const node = { id, name, folders: [], files: [] };
  if (state.folders >= MAX_FOLDERS || Date.now() > state.deadline) { state.partial = true; return node; }
  state.folders++;
  const { title, items } = await listFolder(id);
  if (!name) node.name = title;
  const subs = [];
  for (const it of items) {
    if (it.mime === "folder") { if (depth < MAX_DEPTH) subs.push(it); }
    else if (!isJunk(it.name, it.mime)) node.files.push({ id: it.id, name: it.name, kind: kindOf(it.name, it.mime), modified: it.modified });
  }
  // sub-folders in small parallel batches: quick, and gentle on Drive
  for (let i = 0; i < subs.length; i += 4) {
    const batch = await Promise.all(subs.slice(i, i + 4).map((s) => crawl(s.id, s.name, depth + 1, state).catch(() => { state.partial = true; return { id: s.id, name: s.name, folders: [], files: [] }; })));
    node.folders.push(...batch);
  }
  return node;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  try {
    const state = { folders: 0, partial: false, deadline: Date.now() + BUDGET_MS };
    const tree = await crawl(FOLDER, "", 0, state);
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=86400");
    res.status(200).json({ ok: true, updated: new Date().toISOString(), partial: state.partial, tree });
  } catch (e) {
    // A private folder is the usual cause: say so plainly, and do not cache it for long so fixing the sharing takes effect fast.
    res.setHeader("Cache-Control", "public, s-maxage=30");
    res.status(200).json({ ok: false, reason: e && (e.status === 401 || e.status === 403) ? "private" : e && e.status === 404 ? "missing" : "unavailable", message: String((e && e.message) || e) });
  }
}
