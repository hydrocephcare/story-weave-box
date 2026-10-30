// End-to-end test of the gateway against `wrangler dev` (local KV and R2) and the fake database.
//   node test/e2e/fake-supabase.mjs 9911 &   npx wrangler dev -c wrangler.test.jsonc --port 8787 &   node test/e2e/run.mjs
import { createHash, randomBytes } from "node:crypto";

const BASE = process.env.BASE ?? "http://127.0.0.1:8787", DB = "http://127.0.0.1:9911";
let pass = 0, failed = 0;
const ok = (c, name, extra = "") => { (c ? pass++ : failed++); console.log(`${c ? "PASS" : "FAIL"}  ${name}${c ? "" : "  " + extra}`); };
const b64u = (b) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

async function authorize(name, scope, creds = { email: "admin@test.local", password: "correct-password" }) {
  const reg = await (await fetch(`${BASE}/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_name: name, redirect_uris: ["http://localhost:9999/cb"], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" }) })).json();
  const verifier = b64u(randomBytes(32)), challenge = b64u(createHash("sha256").update(verifier).digest());
  const q = new URLSearchParams({ response_type: "code", client_id: reg.client_id, redirect_uri: "http://localhost:9999/cb", scope: scope.join(" "), state: "st1", code_challenge: challenge, code_challenge_method: "S256", resource: `${BASE}/mcp` });
  const page = await fetch(`${BASE}/authorize?${q}`);
  const html = await page.text();
  const handle = /name="handle" value="([^"]+)"/.exec(html)?.[1];
  const cookie = page.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const form = new URLSearchParams({ handle, email: creds.email, password: creds.password, decision: "approve" });
  scope.forEach((s) => form.append("scope", s));
  const post = await fetch(`${BASE}/authorize?${q}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie }, body: form, redirect: "manual" });
  return { reg, verifier, post, html };
}
async function tokenFor(a) {
  const loc = a.post.headers.get("location") ?? "";
  const code = new URL(loc, "http://x").searchParams.get("code");
  if (!code) return null;
  const t = await (await fetch(`${BASE}/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: a.reg.client_id, redirect_uri: "http://localhost:9999/cb", code_verifier: a.verifier, resource: `${BASE}/mcp` }) })).json();
  return t.access_token ?? null;
}

let rid = 1;
async function rpc(token, method, params) {
  const r = await fetch(`${BASE}/mcp`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", id: rid++, method, params }) });
  const raw = await r.text();
  const data = raw.includes("data:") ? raw.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).pop() : raw;
  let j = null; try { j = JSON.parse(data); } catch { /* not json */ }
  return { status: r.status, json: j, raw, headers: r.headers };
}
const call = async (token, name, args) => {
  const r = await rpc(token, "tools/call", { name, arguments: args });
  const res = r.json?.result;
  const txt = res?.content?.[0]?.text ?? "";
  let val = txt; try { val = JSON.parse(txt); } catch { /* plain text */ }
  return { isError: !!res?.isError || !!r.json?.error, val, status: r.status, err: r.json?.error?.message };
};
const dbRow = async (id) => (await (await fetch(`${DB}/__rows`)).json()).find((x) => x.id === id);

// ---------------------------------------------------------------------------------------------------------------------------------------
const health = await (await fetch(`${BASE}/health`)).json();
ok(health.status === "ok", "health endpoint answers");

const noAuth = await rpc(null, "tools/list", {});
ok(noAuth.status === 401, "MCP without a token is rejected (401)", String(noAuth.status));
ok(/resource_metadata|Bearer/i.test(noAuth.headers.get("www-authenticate") ?? ""), "401 carries an OAuth challenge", noAuth.headers.get("www-authenticate"));
const meta = await fetch(`${BASE}/.well-known/oauth-protected-resource/mcp`).then((r) => r.status).catch(() => 0);
const meta2 = await fetch(`${BASE}/.well-known/oauth-authorization-server`).then((r) => r.status).catch(() => 0);
ok(meta === 200 || (await fetch(`${BASE}/.well-known/oauth-protected-resource`)).status === 200, "protected-resource discovery metadata is served");
ok(meta2 === 200, "authorization-server discovery metadata is served");

// wrong password and a non-admin are refused at the sign-in step
const bad = await authorize("BadActor", ["lessons:read"], { email: "admin@test.local", password: "nope" });
ok(!(bad.post.headers.get("location") ?? "").includes("code="), "wrong password does not authorize");
const stud = await authorize("StudentTry", ["lessons:read"], { email: "student@test.local", password: "student-pass" });
ok(!(stud.post.headers.get("location") ?? "").includes("code="), "a non-admin account does not authorize");

const ALL = ["lessons:read", "lessons:write", "lessons:publish", "images:write", "admin"];
const chat = await authorize("TestGPT", ALL);
ok((chat.post.headers.get("location") ?? "").includes("code="), "admin sign-in authorizes the client", String(chat.post.status));
const T = await tokenFor(chat);
ok(!!T, "authorization code exchanges for an access token (PKCE)");

await rpc(T, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1" } });
const list = await rpc(T, "tools/list", {});
const names = (list.json?.result?.tools ?? []).map((t) => t.name);
ok(names.length >= 30, `tools/list returns the tools (${names.length})`, JSON.stringify(list.json).slice(0, 200));
for (const n of ["search_lessons", "get_lesson", "create_lesson", "update_lesson", "publish_lesson", "upload_image", "upload_multiple_images", "attach_image_to_lesson", "replace_lesson_image", "remove_lesson_image", "get_publishing_status", "get_recent_changes", "get_system_status", "list_years", "list_semesters", "list_units", "list_categories", "get_lesson_images", "get_lesson_metadata", "list_lessons", "save_lesson_draft", "unpublish_lesson", "archive_lesson", "preview_lesson", "validate_lesson", "get_lesson_preview", "list_images"]) ok(names.includes(n), `tool present: ${n}`);

const sys = await call(T, "get_system_status", {});
ok(!sys.isError && sys.val.database === "ok" && sys.val.image_storage === "ok", "system status: database and image storage reachable", JSON.stringify(sys.val));

// reading
const found = await call(T, "search_lessons", { query: "acute abdomen" });
ok(found.val.results?.length === 1 && found.val.results[0].id.startsWith("1111"), "search finds the existing lesson");
ok(!("content" in (found.val.results?.[0] ?? {})), "search results do not include the full text");
const L = "11111111-1111-4111-8111-111111111111";
const got = await call(T, "get_lesson", { id: L });
ok(got.val.content?.includes("## 2. Management") && got.val.url.endsWith("/blog/year-4-surgery-acute-abdomen"), "existing lesson is retrieved with its url");

// duplicate protection
const dup = await call(T, "create_lesson", { title: "Acute Abdomen", category: "Year 4: Surgery", content: "## A\n\n" + "x ".repeat(120) + "\n\n## B\n\ny\n" });
ok(dup.isError && /already exists/.test(String(dup.val)), "creating a duplicate lesson is refused", JSON.stringify(dup.val).slice(0, 150));

// editing goes to a draft; live text is untouched
const upd = await call(T, "update_lesson", { id: L, operation: "insert_after_section", after_heading: "Causes", heading: "Appendicitis", body: "Periumbilical pain migrating to the right iliac fossa. Anorexia, vomiting, low fever.\n\n| Sign | Finding |\n| --- | --- |\n| McBurney | Tender |" });
ok(!upd.isError && upd.val.draft_saved && upd.val.changes.added.includes("appendicitis"), "update_lesson saves a partial edit as a draft", JSON.stringify(upd.val).slice(0, 200));
ok(!(await dbRow(L)).content.includes("Appendicitis"), "the live lesson is unchanged by a draft");

// images
const up1 = await call(T, "upload_multiple_images", { images: [
  { filename: "Appendix Anatomy.PNG", data_base64: png.toString("base64"), alt: "Appendix anatomy", caption: "Position of the appendix" },
  { filename: "mcburney.png", data_base64: png.toString("base64"), alt: "McBurney point", caption: "McBurney point" },
  { filename: "ct.png", data_base64: png.toString("base64"), alt: "CT appendicitis", caption: "CT scan" }] });
ok(!up1.isError && up1.val.images?.length === 3 && up1.val.images.every((i) => i.url.startsWith("https://cdn.ompathstudy.com/ai/")), "three images upload to R2 with CDN urls", JSON.stringify(up1.val).slice(0, 200));
ok(new Set(up1.val.images.map((i) => i.url)).size === 3, "filenames are unique");
const evil = await call(T, "upload_image", { filename: "x.png", data_base64: Buffer.from("<svg onload=alert(1)></svg>".repeat(10)).toString("base64"), alt: "x" });
ok(evil.isError && /JPEG, PNG and WebP/.test(String(evil.val)), "a file that is not a real image is refused even if named .png");
const att1 = await call(T, "attach_image_to_lesson", { id: L, image_url: up1.val.images[0].url, alt: "Appendix anatomy", caption: "Position of the appendix", section_heading: "Appendicitis" });
const att2 = await call(T, "attach_image_to_lesson", { id: L, image_url: up1.val.images[1].url, alt: "McBurney point", caption: "McBurney point", section_heading: "Appendicitis", position: "end" });
const att3 = await call(T, "attach_image_to_lesson", { id: L, image_url: up1.val.images[2].url, alt: "CT appendicitis", caption: "CT scan", section_heading: "Management" });
ok(!att1.isError && !att2.isError && !att3.isError, "three images attach to precise sections", JSON.stringify([att1.val, att2.val, att3.val]).slice(0, 300));
const offsite = await call(T, "attach_image_to_lesson", { id: L, image_url: "https://evil.example/a.png", alt: "bad", section_heading: "Causes" });
ok(offsite.isError, "an image from another site cannot be attached");
const imgs = await call(T, "get_lesson_images", { id: L, include_draft: true });
ok(imgs.val.images?.length === 3 && imgs.val.images.every((i) => i.alt && i.caption), "draft lists 3 images with alt text and captions");
const rep = await call(T, "replace_lesson_image", { id: L, old_image_url: up1.val.images[2].url, new_image_url: up1.val.images[0].url, caption: "CT (replaced)" });
ok(!rep.isError, "an image can be replaced in place");
const rem = await call(T, "remove_lesson_image", { id: L, image_url: up1.val.images[0].url, confirm_user_approved: true });
ok(!rem.isError, "an image can be removed (with confirmation)");
const remNo = await call(T, "remove_lesson_image", { id: L, image_url: up1.val.images[1].url });
ok(remNo.isError, "removing an image without confirmation is refused");
const listi = await call(T, "list_images", {});
ok(listi.val.images?.length >= 3, "list_images shows stored images");
const cdn = await fetch(up1.val.images[0].url.replace("https://cdn.ompathstudy.com", `${BASE}/__r2`)).then((r) => r.status).catch(() => 0);
void cdn;

// preview and publish rules
const prev = await call(T, "preview_lesson", { id: L });
ok(!prev.isError && prev.val.preview_hash?.length === 64 && prev.val.outline.length > 4 && prev.val.validation.ok, "preview shows outline, changes and a hash", JSON.stringify(prev.val).slice(0, 200));
const noConfirm = await call(T, "publish_lesson", { id: L, preview_hash: prev.val.preview_hash });
ok(noConfirm.isError, "publish without confirm_user_approved is refused");
const wrongHash = await call(T, "publish_lesson", { id: L, preview_hash: "0".repeat(64), confirm_user_approved: true });
ok(wrongHash.isError && /changed since it was previewed/.test(String(wrongHash.val)), "publish with a stale hash is refused");
ok(!(await dbRow(L)).content.includes("Appendicitis"), "nothing went live from the refused attempts");
const thin = await call(T, "publish_lesson", { id: L, preview_hash: prev.val.preview_hash, confirm_user_approved: true });
ok(thin.isError && /does not follow the OmpathStudy format/.test(String(thin.val)), "a lesson far from the house format is refused unless the user accepts the gaps", String(thin.val).slice(0, 120));
ok(!(await dbRow(L)).content.includes("Appendicitis"), "nothing went live from the format refusal");
const guide = await call(T, "get_style_guide", {});
ok(!guide.isError && String(guide.val).includes("In one line") && String(guide.val).includes("Key points to revise"), "get_style_guide returns the house format");
ok(!prev.isError && Array.isArray(prev.val.format?.missing) && prev.val.format.missing.length > 0, "preview lists what is missing from the format");
const pub = await call(T, "publish_lesson", { id: L, preview_hash: prev.val.preview_hash, confirm_user_approved: true, allow_format_gaps: true });
ok(!pub.isError && pub.val.published && pub.val.verified && !!pub.val.revision, "publish succeeds only after the database confirms", JSON.stringify(pub.val).slice(0, 250));
const live = await dbRow(L);
ok(live.content.includes("Appendicitis") && live.content.includes("cdn.ompathstudy.com/ai/") && live.id === L && live.slug === "year-4-surgery-acute-abdomen", "live lesson updated; id and slug preserved");
ok(live.content.includes("## What you must know") && live.content.includes("Resuscitate first."), "the rest of the lesson was preserved");
const stat = await call(T, "get_publishing_status", { id: L });
ok(stat.val.published && stat.val.revisions?.length >= 1 && !stat.val.draft_waiting, "publishing status reports the real state and the saved revision");

// new lesson: draft only, then not live
const created = await call(T, "create_lesson", { title: "Intestinal Obstruction", category: "Year 4: Surgery", unit: "Surgery", content: "# Intestinal Obstruction\n\n## What you must know\n\n" + "Obstruction is a mechanical or functional block. ".repeat(8) + "\n\n## 1. Causes\n\nAdhesions, hernias, malignancy.\n\n## Key points to revise\n\n1. Resuscitate.\n" });
ok(!created.isError && created.val.published === false, "create_lesson makes an unpublished draft", JSON.stringify(created.val).slice(0, 200));
const bad2 = await call(T, "create_lesson", { title: "Bad HTML Lesson", category: "Year 4: Surgery", content: "## A\n\n<script>alert(1)</script>" + "x ".repeat(120) + "\n\n## B\n\ny" });
ok(!bad2.isError ? (await dbRow(bad2.val.id)).content.includes("<script") === false : true, "script tags never reach the database");

// destructive actions need confirmation
const arch = await call(T, "archive_lesson", { id: "22222222-2222-4222-8222-222222222222" });
ok(arch.isError, "archive_lesson without confirmation is refused");
const unp = await call(T, "unpublish_lesson", { id: "22222222-2222-4222-8222-222222222222" });
ok(unp.isError, "unpublish_lesson without confirmation is refused");
ok((await dbRow("22222222-2222-4222-8222-222222222222")).published === true, "the other lesson was not touched");

// least privilege: a read-only assistant cannot write
const ro = await authorize("ReadOnlyBot", ["lessons:read"]);
const T2 = await tokenFor(ro);
const roRead = await call(T2, "search_lessons", { query: "hernia" });
const roWrite = await call(T2, "update_lesson", { id: L, operation: "append_section", heading: "X", body: "y" });
const roAdmin = await call(T2, "admin_list_clients", {});
ok(!roRead.isError && roRead.val.results?.length === 1, "read-only assistant can read");
ok(roWrite.isError && /not granted/.test(String(roWrite.val)), "read-only assistant cannot write");
ok(roAdmin.isError, "read-only assistant cannot use admin tools");

// audit
const recent = await call(T, "get_recent_changes", { limit: 50 });
const ops = (recent.val.changes ?? []).map((c) => `${c.op}:${c.ok}`);
ok(ops.includes("publish_lesson:true") && ops.includes("update_lesson:true") && ops.some((o) => o.endsWith(":false")), "audit log records successes and failures", ops.slice(0, 8).join(","));
ok((recent.val.changes ?? []).every((c) => c.client && c.ts), "audit entries name the assistant and the time");

// kill switch
await call(T, "admin_set_publishing", { enabled: false });
const blocked = await call(T, "update_lesson", { id: L, operation: "append_section", heading: "Later", body: "x" });
ok(blocked.isError && /switched off/.test(String(blocked.val)), "kill switch stops writing");
const stillRead = await call(T, "get_lesson_metadata", { id: L });
ok(!stillRead.isError, "reading still works with publishing off");
await call(T, "admin_set_publishing", { enabled: true });

// revoke one assistant without affecting the other
const clients = await call(T, "admin_list_clients", {});
ok(clients.val.clients?.length >= 2, "admin can list connected assistants", JSON.stringify(clients.val).slice(0, 150));
const rev = await call(T, "admin_revoke_client", { client_id: ro.reg.client_id, confirm_user_approved: true });
ok(!rev.isError, "admin can revoke one assistant");
const after = await call(T2, "search_lessons", { query: "hernia" });
const stillOk = await call(T, "get_lesson_metadata", { id: L });
ok(after.isError || after.status === 401, "revoked assistant stops working", JSON.stringify(after).slice(0, 150));
ok(!stillOk.isError, "other assistants are unaffected by the revocation");

// import an image from a web link (for assistants that cannot send bytes), with the credit the licence needs
const imp = await call(T, "import_image_from_url", { image_url: DB + "/__img.png", alt: "Upright chest X-ray: large left pleural effusion", caption: "Large left pleural effusion", credit: "James Heilman, MD, Wikimedia Commons, CC BY-SA 3.0", source_page: "https://commons.wikimedia.org/wiki/File:Effusionhalf.PNG" });
ok(!imp.isError && imp.val.url?.startsWith("https://cdn.ompathstudy.com/ai/") && /CC BY-SA/.test(imp.val.suggested_caption), "an image is imported from a web link into OmpathStudy storage, with its credit", JSON.stringify(imp.val).slice(0, 200));
const impAtt = await call(T, "attach_image_to_lesson", { id: L, image_url: imp.val.url, alt: "Chest X-ray, large left pleural effusion", caption: imp.val.suggested_caption, section_heading: "Causes" });
ok(!impAtt.isError, "the imported image attaches to a lesson with the credit in its caption");
const impHtml = await call(T, "import_image_from_url", { image_url: DB + "/__fake.png", alt: "not an image", credit: "nobody" });
ok(impHtml.isError && /JPEG, PNG and WebP/.test(String(impHtml.val)), "a link that is really HTML or a script is refused even if served as image/png");
const imp404 = await call(T, "import_image_from_url", { image_url: DB + "/__missing.png", alt: "missing image", credit: "nobody" });
ok(imp404.isError && /404/.test(String(imp404.val)), "a dead image link gives a clear error");
const impNoCredit = await call(T, "import_image_from_url", { image_url: DB + "/__img.png", alt: "no credit given" });
ok(impNoCredit.isError, "an import without a credit line is refused");
const impFtp = await call(T, "import_image_from_url", { image_url: "ftp://example.com/a.png", alt: "ftp image", credit: "nobody" });
ok(impFtp.isError, "a non-web link (ftp) is refused");


// REAL internet test (REAL_WIKI=1): the actual Wikimedia chest X-ray, imported, attached to a Pleural Effusion TEST lesson in the fake database, and listed back
if (process.env.REAL_WIKI) {
  const body = "# Pleural Effusion\n\n**Year 4 · Internal Medicine · Respiratory**\n\n> **In one line:** fluid in the pleural space.\n\n## What you must know\n\n- Transudate or exudate by Light's criteria.\n\n## Causes\n\nHeart failure, infection and malignancy cause most effusions in practice.\n\n## Investigations\n\nChest X-ray, ultrasound and pleural fluid analysis are the first steps.\n\n### Chest X-ray\n\nA large effusion shows a meniscus sign and a dense homogeneous opacity.\n\n## Management\n\nTreat the cause and drain if symptomatic.\n\n## Key points to revise\n\n- Light's criteria separate exudate from transudate.\n";
  const pe = await call(T, "create_lesson", { title: "Pleural Effusion", category: "Year 4: Internal Medicine", unit: "Internal Medicine", content: body + "More teaching text. ".repeat(20) });
  ok(!pe.isError, "test lesson 'Pleural Effusion' created as an unpublished draft (fake database only)", JSON.stringify(pe.val).slice(0, 200));
  const wiki = await call(T, "import_image_from_url", { image_url: "https://upload.wikimedia.org/wikipedia/commons/3/30/Effusionhalf.PNG", alt: "Upright chest X-ray showing a large left pleural effusion", caption: "Large left pleural effusion on an upright chest X-ray", credit: "James Heilman, MD, Wikimedia Commons, CC BY-SA 3.0", source_page: "https://commons.wikimedia.org/wiki/File:Effusionhalf.PNG" });
  ok(!wiki.isError && wiki.val.url?.startsWith("https://cdn.ompathstudy.com/ai/") && !wiki.val.url.includes("wikimedia"), "the real Wikimedia image is imported and the returned url is the OmpathStudy CDN, not the original", JSON.stringify(wiki.val).slice(0, 260));
  ok(wiki.val.bytes > 5000 && ["image/png", "image/jpeg", "image/webp"].includes(wiki.val.type), `the stored file is a real image (${wiki.val.type}, ${wiki.val.bytes} bytes)`);
  ok(/CC BY-SA 3.0/.test(wiki.val.suggested_caption ?? ""), "the credit is kept in the suggested caption");
  const att = await call(T, "attach_image_to_lesson", { id: pe.val.id, image_url: wiki.val.url, alt: "Upright chest X-ray showing a large left pleural effusion", caption: wiki.val.suggested_caption, section_heading: "Chest X-ray" });
  ok(!att.isError && att.val.images === 1, "the image attaches under the 'Chest X-ray' section of the lesson draft", JSON.stringify(att.val).slice(0, 200));
  const li = await call(T, "get_lesson_images", { id: pe.val.id, include_draft: true });
  ok(li.val.images?.length === 1 && li.val.images[0].url === wiki.val.url && /Pleural effusion|pleural effusion/.test(li.val.images[0].alt) && /CC BY-SA/.test(li.val.images[0].caption), "get_lesson_images shows the image with its alt text and credit", JSON.stringify(li.val).slice(0, 240));
  const prevW = await call(T, "preview_lesson", { id: pe.val.id });
  const outline = (prevW.val.outline ?? []).join("|");
  ok(outline.includes("Chest X-ray") && prevW.val.images?.length === 1, "the preview places the image in the Chest X-ray section", outline.slice(0, 160));
  const live = await dbRow(pe.val.id);
  ok(live.published === false && !live.content.includes("cdn.ompathstudy.com"), "nothing was published or changed on the live lesson row");
  const st = await call(T, "get_system_status", {});
  ok(st.val.has_get_style_guide && st.val.has_import_image_from_url && st.val.tool_count >= 33, `system status reports the new tools (${st.val.tool_count} tools, v${st.val.version})`);
}


// upload link
const ul = await call(T, "request_upload_url", { count: 1 });
const uurl = ul.val.uploads?.[0]?.upload_url?.replace(/^https?:\/\/[^/]+/, BASE);
const put = await fetch(uurl, { method: "PUT", headers: { "Content-Type": "image/png" }, body: png });
const putj = await put.json().catch(() => ({}));
ok(put.status === 200 && putj.url?.includes("/ai/"), "a signed upload link accepts an image", JSON.stringify(putj));
const again = await fetch(uurl, { method: "PUT", body: png });
ok(again.status === 409, "an upload link works only once");
const forged = await fetch(`${BASE}/upload/${uurl.split("/upload/")[1].slice(0, -4)}beef`, { method: "PUT", body: png });
ok(forged.status === 401, "a forged upload link is refused");

// the database door itself (real function code): wrong secret and out-of-bounds requests are refused
if (process.env.BRIDGE) {
  const fn = (secret, body) => fetch(DB + "/functions/v1/publish-gateway-db", { method: "POST", headers: { "x-gateway-secret": secret, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const S = "bridge-test-secret-0123456789abcdef";
  ok((await fn("wrong-secret-wrong-secret-wrong", { method: "GET", path: "articles?select=id" })).status === 403, "bridge: wrong secret is refused");
  ok((await fn(S, { method: "GET", path: "profiles?select=*" })).status === 400, "bridge: a table outside the lessons is refused");
  ok((await fn(S, { method: "GET", path: "user_roles?select=*" })).status === 400, "bridge: roles table is refused");
  ok((await fn(S, { method: "PATCH", path: "articles?published=eq.true", body: { title: "x" } })).status === 400, "bridge: a bulk update (no single id) is refused");
  ok((await fn(S, { method: "PATCH", path: "articles?id=eq.11111111-1111-4111-8111-111111111111", body: { access_password: "x" } })).status === 400, "bridge: a column outside the whitelist is refused");
  ok((await fn(S, { method: "DELETE", path: "articles?id=eq.11111111-1111-4111-8111-111111111111" })).status === 400, "bridge: delete is refused");
  ok((await fn(S, { method: "GET", path: "articles?select=id&limit=1" })).status === 200, "bridge: an allowed read works");
}

console.log(`\n${pass} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
