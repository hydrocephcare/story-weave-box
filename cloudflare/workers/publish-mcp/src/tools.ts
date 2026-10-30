import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { applyEdit, attachImage, diffSections, listImages, normTitle, removeImage, replaceImage, sanitize, sections, sha256Hex, slugify, validateLesson, type EditOp } from "./lib/content";
import { fromBase64, signUploadToken, storeImage } from "./lib/images";
import { audit, db, overlayIds, purge, rateLimit, state, type Draft, type Env, type Props } from "./lib/platform";

const VERSION = "1.0.0";
const text = (v: unknown) => ({ content: [{ type: "text" as const, text: typeof v === "string" ? v : JSON.stringify(v, null, 2) }] });
const fail = (m: string) => ({ isError: true as const, content: [{ type: "text" as const, text: m }] });

const idOrSlug = z.string().min(3).max(200).describe("Lesson id (uuid) or slug");
const confirm = (what: string) => z.literal(true).describe(`Must be true. Set it only after the user has explicitly agreed to: ${what}`);

export function buildServer(env: Env, p: Props, origin: string): McpServer {
  const server = new McpServer({ name: "ompathstudy-publishing", version: VERSION });
  const client = `${p.clientName || p.clientId}`;

  /** One place for scope checks, kill switch, rate limit and the audit line, so no tool can forget them. */
  function tool<S extends z.ZodRawShape>(name: string, description: string, scope: string, mutating: boolean, shape: S, fn: (a: z.infer<z.ZodObject<S>>) => Promise<unknown>) {
    server.registerTool(name, { description, inputSchema: z.object(shape) }, async (args: any) => {
      const lesson = typeof args?.id === "string" ? args.id : undefined;
      try {
        if (!p.scope.includes(scope)) throw new Error(`This connection was not granted "${scope}". Re-authorize it with that permission.`);
        if (mutating && !(await state.publishingEnabled(env))) throw new Error("Publishing is switched off by the site owner.");
        await rateLimit(env, p.clientId, mutating);
        const out = await fn(args);
        if (mutating) await audit.log(env, { client, user: p.email, op: name, lesson, ok: true, detail: (out as any)?.revision ? `revision ${(out as any).revision}` : undefined, revision: (out as any)?.revision });
        return text(out);
      } catch (e: any) {
        const msg = e?.message ?? String(e);
        if (mutating) await audit.log(env, { client, user: p.email, op: name, lesson, ok: false, detail: msg }).catch(() => {});
        return fail(msg);
      }
    });
  }

  const loadLesson = async (id: string) => {
    const row = await db.get(env, id);
    if (!row) throw new Error("No such lesson.");
    return row as any;
  };
  const working = async (row: any) => {
    const d = await state.getDraft(env, row.id);
    return { draft: d, content: d?.content ?? row.content ?? "", title: d?.title ?? row.title };
  };
  const saveDraft = async (row: any, content: string, title?: string) => {
    const clean = sanitize(content);
    const v = validateLesson(clean);
    if (!v.ok) throw new Error(`Draft not saved: ${v.errors.join(" ")}`);
    const prev = await state.getDraft(env, row.id);
    const d: Draft = {
      content: clean, title: title ?? prev?.title,
      baseUpdatedAt: prev?.baseUpdatedAt ?? row.updated_at ?? null,
      baseHash: prev?.baseHash ?? (await sha256Hex(row.content ?? "")),
      by: client, updatedAt: new Date().toISOString(),
    };
    await state.putDraft(env, row.id, d);
    return { hash: await sha256Hex(clean), validation: v };
  };
  const url = (slug: string) => `${env.SITE_URL}/blog/${slug}`;

  // ------------------------------------------------------------------ A. reading
  tool("search_lessons", "Search lessons by title or slug. Use this first, before creating or editing anything, to find the existing lesson.", "lessons:read", false, {
    query: z.string().min(2).max(100), category: z.string().max(120).optional().describe("Exact category, e.g. 'Year 4: Surgery'"),
    include_unpublished: z.boolean().optional(), limit: z.number().int().min(1).max(50).optional(),
  }, async (a) => ({ results: await db.search(env, a.query, { category: a.category, includeDrafts: a.include_unpublished, limit: a.limit }) }));

  tool("list_lessons", "List lessons, newest first, optionally by category, unit or published state.", "lessons:read", false, {
    category: z.string().optional(), unit: z.string().optional(), published: z.boolean().optional(), limit: z.number().int().min(1).max(100).optional(), offset: z.number().int().min(0).optional(),
  }, async (a) => ({ results: await db.list(env, a) }));

  tool("get_lesson", "Read one lesson: the published text, and the pending draft if there is one. Check 'overlay' before editing.", "lessons:read", false, {
    id: idOrSlug,
  }, async (a) => {
    const row = await loadLesson(a.id);
    const d = await state.getDraft(env, row.id);
    const overlay = (await overlayIds(env)).has(row.id);
    return { ...row, url: url(row.slug), has_draft: !!d, draft: d ? { content: d.content, by: d.by, updatedAt: d.updatedAt } : null, overlay,
      overlay_note: overlay ? "Readers see a rewritten copy of this lesson stored on the website. Database edits will not change what they see until that file is removed or updated in the repository." : undefined };
  });

  tool("get_lesson_metadata", "Title, slug, category, unit, tags, SEO fields, state and timestamps, without the body.", "lessons:read", false, { id: idOrSlug }, async (a) => {
    const row = await db.get(env, a.id, false);
    if (!row) throw new Error("No such lesson.");
    return { ...row, url: url(row.slug), has_draft: !!(await state.getDraft(env, row.id)), revisions: await state.listRevisions(env, row.id) };
  });

  tool("list_categories", "All lesson categories with lesson counts (for example 'Year 4: Surgery').", "lessons:read", false, {}, async () => ({ categories: await db.categories(env) }));
  tool("list_years", "Academic years.", "lessons:read", false, {}, async () => ({ years: await db.lookup(env, "academic_years", {}) }));
  tool("list_semesters", "Semesters, optionally for one academic year id.", "lessons:read", false, { year_id: z.string().optional() }, async (a) => ({ semesters: await db.lookup(env, "semesters", { year: a.year_id }) }));
  tool("list_units", "Units, optionally for one semester id.", "lessons:read", false, { semester_id: z.string().optional() }, async (a) => ({ units: await db.lookup(env, "units", { semester: a.semester_id }) }));

  tool("get_lesson_images", "Images used in a lesson (published text, or the draft with include_draft), with alt text and captions.", "lessons:read", false, {
    id: idOrSlug, include_draft: z.boolean().optional(),
  }, async (a) => {
    const row = await loadLesson(a.id);
    const w = a.include_draft ? (await working(row)).content : row.content ?? "";
    return { images: listImages(w).map(({ alt, url: u, caption }) => ({ alt, url: u, caption })) };
  });

  // ------------------------------------------------------------------ B. writing (drafts only until publish_lesson)
  tool("create_lesson", "Create a NEW lesson as an unpublished draft. Refuses if a lesson with the same title or slug exists (search first, then update that one instead).", "lessons:write", true, {
    title: z.string().min(4).max(160), category: z.string().min(3).max(120), unit: z.string().max(120).optional(),
    content: z.string().min(200).describe("Markdown. Use '## ' sections, tables, lists. End with '## Key points to revise'."),
    tags: z.array(z.string().max(40)).max(12).optional(), meta_description: z.string().max(300).optional(),
  }, async (a) => {
    const slug = `${slugify(a.category)}-${slugify(a.title)}`.slice(0, 120);
    const dups = await db.duplicates(env, slug, a.title, a.category);
    if (dups.length) throw new Error(`A similar lesson already exists: ${dups.map((d: any) => `${d.title} (${d.id})`).join("; ")}. Update it instead.`);
    const content = sanitize(a.content);
    const v = validateLesson(content, { title: a.title });
    if (!v.ok) throw new Error(`Not created: ${v.errors.join(" ")}`);
    const row = await db.insert(env, { title: a.title, slug, content, category: a.category, unit: a.unit ?? null, tags: a.tags ?? [], meta_description: a.meta_description ?? null,
      published: false, content_kind: "note", content_type: "Notes", source_type: "ai_gateway", is_raw: false });
    return { id: row.id, slug: row.slug, published: false, validation: v, next: "Call preview_lesson, show the user, and publish_lesson only after they approve." };
  });

  tool("update_lesson", "Change part of a lesson. Edits go to a DRAFT; the live lesson is untouched until publish_lesson. Prefer this over save_lesson_draft: it changes one section and leaves the rest as it is.", "lessons:write", true, {
    id: idOrSlug,
    operation: z.enum(["replace_section", "append_to_section", "append_section", "insert_after_section", "delete_section"]),
    heading: z.string().min(1).max(160).describe("Section heading to change, or the new heading for append_section / insert_after_section"),
    after_heading: z.string().optional().describe("For insert_after_section: the existing section to insert after"),
    body: z.string().max(100_000).optional().describe("Markdown for the section body (not needed for delete_section)"),
    level: z.number().int().min(2).max(4).optional(),
    confirm_delete: z.boolean().optional().describe("Required (true) for delete_section"),
  }, async (a) => {
    const row = await loadLesson(a.id);
    const w = await working(row);
    if (a.operation === "delete_section" && a.confirm_delete !== true) throw new Error("delete_section needs confirm_delete: true after the user agrees.");
    if (a.operation !== "delete_section" && !a.body) throw new Error("body is required.");
    let edit: EditOp;
    switch (a.operation) {
      case "replace_section": edit = { op: "replace_section", heading: a.heading, body: a.body! }; break;
      case "append_to_section": edit = { op: "append_to_section", heading: a.heading, body: a.body! }; break;
      case "append_section": edit = { op: "append_section", heading: a.heading, body: a.body!, level: a.level }; break;
      case "insert_after_section": if (!a.after_heading) throw new Error("after_heading is required."); edit = { op: "insert_after_section", after_heading: a.after_heading, heading: a.heading, body: a.body!, level: a.level }; break;
      default: edit = { op: "delete_section", heading: a.heading };
    }
    const next = applyEdit(w.content, edit);
    const s = await saveDraft(row, next);
    return { id: row.id, draft_saved: true, preview_hash: s.hash, changes: diffSections(row.content ?? "", next), validation: s.validation, overlay: (await overlayIds(env)).has(row.id) };
  });

  tool("save_lesson_draft", "Replace the WHOLE working text of a lesson with new Markdown (as a draft). Use update_lesson for section changes. Replacing a published lesson wholesale needs confirm_full_replace.", "lessons:write", true, {
    id: idOrSlug, content: z.string().min(200), title: z.string().min(4).max(160).optional(), confirm_full_replace: z.boolean().optional(),
  }, async (a) => {
    const row = await loadLesson(a.id);
    if (row.published && a.confirm_full_replace !== true) throw new Error("This lesson is published. Use update_lesson for a section, or pass confirm_full_replace: true after the user agrees to replace the whole text.");
    const s = await saveDraft(row, a.content, a.title);
    return { id: row.id, draft_saved: true, preview_hash: s.hash, changes: diffSections(row.content ?? "", sanitize(a.content)), validation: s.validation };
  });

  tool("validate_lesson", "Check Markdown (or a lesson's draft) against the site's rules without saving anything.", "lessons:read", false, {
    id: idOrSlug.optional(), content: z.string().optional(),
  }, async (a) => {
    let md = a.content;
    if (md === undefined) { if (!a.id) throw new Error("Give id or content."); md = (await working(await loadLesson(a.id))).content; }
    return validateLesson(sanitize(md as string));
  });

  const preview = async (id: string) => {
    const row = await loadLesson(id);
    const w = await working(row);
    const v = validateLesson(w.content);
    const hash = await sha256Hex(w.content);
    return {
      id: row.id, title: w.title, will_publish_at: url(row.slug), currently_published: row.published, has_draft: !!w.draft,
      preview_hash: hash, outline: sections(w.content).map((s) => `${"  ".repeat(s.level - 1)}${s.heading}`), images: listImages(w.content),
      changes_vs_live: diffSections(row.content ?? "", w.content), validation: v,
      opening: w.content.slice(0, 1500), overlay: (await overlayIds(env)).has(row.id),
      note: "Show the outline and changes to the user. publish_lesson needs this preview_hash.",
    };
  };
  tool("preview_lesson", "Show what publishing would do: outline, section changes against the live text, images, validation and a preview_hash. Nothing is changed.", "lessons:read", false, { id: idOrSlug }, (a) => preview(a.id));
  tool("get_lesson_preview", "Same as preview_lesson.", "lessons:read", false, { id: idOrSlug }, (a) => preview(a.id));

  tool("publish_lesson", "Make the draft live. ONLY after the user has seen the preview and explicitly said to publish. Requires the preview_hash from preview_lesson so exactly what they saw is what goes live.", "lessons:publish", true, {
    id: idOrSlug, preview_hash: z.string().length(64), confirm_user_approved: confirm("publishing this lesson now"),
  }, async (a) => {
    const row = await loadLesson(a.id);
    const w = await working(row);
    if (!w.draft && row.published) throw new Error("There is no pending draft to publish.");
    const hash = await sha256Hex(w.content);
    if (hash !== a.preview_hash) throw new Error("The draft changed since it was previewed. Call preview_lesson again and show the user.");
    const v = validateLesson(w.content);
    if (!v.ok) throw new Error(`Not published: ${v.errors.join(" ")}`);
    if (w.draft?.baseUpdatedAt && row.updated_at && w.draft.baseUpdatedAt !== row.updated_at) throw new Error("The lesson was changed by someone else after this draft was started. Re-read it and redo the edit.");
    const revision = await state.putRevision(env, row.id, { title: row.title, content: row.content ?? "", published: !!row.published, by: client });
    const saved = await db.patch(env, row.id, { content: w.content, title: w.title, published: true });
    const check = await db.get(env, row.id);
    const verified = !!check && (await sha256Hex(check.content ?? "")) === hash && check.published === true;
    if (!verified) throw new Error("The database did not confirm the change. Nothing is reported as published; the previous text is saved as revision " + revision + ".");
    await state.delDraft(env, row.id);
    const purged = await purge(env, row.slug);
    const overlay = (await overlayIds(env)).has(row.id);
    return { published: true, verified, id: row.id, url: url(row.slug), updated_at: saved?.updated_at, revision, cache_purged: purged,
      warning: overlay ? "Readers still see a rewritten copy of this lesson stored on the website; the new text will not show until that file is updated." : undefined };
  });

  tool("unpublish_lesson", "Take a lesson offline (it becomes a draft again). Needs the user's explicit agreement.", "lessons:publish", true, {
    id: idOrSlug, confirm_user_approved: confirm("taking this lesson offline"),
  }, async (a) => {
    const row = await loadLesson(a.id);
    const revision = await state.putRevision(env, row.id, { title: row.title, content: row.content ?? "", published: !!row.published, by: client });
    await db.patch(env, row.id, { published: false });
    return { published: false, id: row.id, revision, cache_purged: await purge(env, row.slug) };
  });

  tool("archive_lesson", "Move a lesson to the site's trash (soft delete; it can be restored). Needs the user's explicit agreement.", "lessons:publish", true, {
    id: idOrSlug, confirm_user_approved: confirm("archiving (removing) this lesson"),
  }, async (a) => {
    const row = await loadLesson(a.id);
    const revision = await state.putRevision(env, row.id, { title: row.title, content: row.content ?? "", published: !!row.published, by: client });
    await db.patch(env, row.id, { published: false, deleted_at: new Date().toISOString() });
    await state.delDraft(env, row.id);
    return { archived: true, id: row.id, revision, cache_purged: await purge(env, row.slug) };
  });

  tool("get_publishing_status", "Real state of a lesson: live or not, whether a draft is waiting, last change, revisions saved.", "lessons:read", false, { id: idOrSlug }, async (a) => {
    const row = await db.get(env, a.id, false);
    if (!row) throw new Error("No such lesson.");
    const d = await state.getDraft(env, row.id);
    let live: number | null = null;
    if (row.published && !row.deleted_at) { try { live = (await fetch(url(row.slug), { method: "HEAD", redirect: "follow" })).status; } catch { live = null; } }
    return { id: row.id, published: !!row.published, archived: !!row.deleted_at, url: url(row.slug), site_http_status: live, updated_at: row.updated_at,
      draft_waiting: !!d, draft_by: d?.by, draft_updated_at: d?.updatedAt, revisions: await state.listRevisions(env, row.id), overlay: (await overlayIds(env)).has(row.id) };
  });

  // ------------------------------------------------------------------ C. images
  const imgArgs = { filename: z.string().min(1).max(120), data_base64: z.string().min(20).describe("The image file, base64 (JPEG, PNG or WebP, up to 8 MB)"), alt: z.string().max(300).optional(), caption: z.string().max(300).optional() };
  const up = async (i: { filename: string; data_base64: string; alt?: string; caption?: string }) =>
    storeImage(env, fromBase64(i.data_base64), i.filename, { by: client, alt: i.alt, caption: i.caption });

  tool("upload_image", "Upload one image to OmpathStudy image storage and get its CDN URL. Then attach_image_to_lesson.", "images:write", true, imgArgs, async (a) => ({ ...(await up(a)), alt: a.alt, caption: a.caption }));
  tool("upload_multiple_images", "Upload up to 6 images in one call.", "images:write", true, {
    images: z.array(z.object(imgArgs)).min(1).max(6),
  }, async (a) => { const out = []; for (const i of a.images) out.push({ ...(await up(i)), alt: i.alt, caption: i.caption }); return { images: out }; });

  tool("request_upload_url", "For assistants that cannot send file bytes inside a tool call: returns short-lived upload URLs. PUT or POST the raw image bytes to each URL (Content-Type: image/jpeg, image/png or image/webp); the response is the CDN URL.", "images:write", true, {
    count: z.number().int().min(1).max(6).optional(),
  }, async (a) => {
    const base = origin;
    const urls = [];
    for (let i = 0; i < (a.count ?? 1); i++) { const t = await signUploadToken(env.UPLOAD_SIGNING_SECRET, client); urls.push({ upload_url: `${base}/upload/${t.token}`, expires_in_seconds: 600, single_use: true }); }
    return { uploads: urls, how: "curl -X PUT --data-binary @file.png -H 'Content-Type: image/png' <upload_url>" };
  });

  tool("list_images", "List images uploaded through this gateway, newest first.", "lessons:read", false, { limit: z.number().int().min(1).max(100).optional() }, async (a) => {
    const l = await env.BUCKET.list({ prefix: "ai/", limit: 1000 });
    const objs = l.objects.sort((x, y) => +y.uploaded - +x.uploaded).slice(0, a.limit ?? 30);
    return { images: objs.map((o) => ({ url: `${env.PUBLIC_BASE.replace(/\/+$/, "")}/${o.key}`, bytes: o.size, uploaded: o.uploaded, by: o.customMetadata?.by, alt: o.customMetadata?.alt, caption: o.customMetadata?.caption })) };
  });

  const edit = async (id: string, f: (md: string) => string) => {
    const row = await loadLesson(id);
    const w = await working(row);
    const next = f(w.content);
    const s = await saveDraft(row, next);
    return { id: row.id, draft_saved: true, preview_hash: s.hash, images: listImages(next).length, validation: s.validation };
  };
  tool("attach_image_to_lesson", "Put an uploaded image into a lesson DRAFT under a section heading (start or end of that section) with alt text and caption.", "lessons:write", true, {
    id: idOrSlug, image_url: z.string().url(), alt: z.string().min(3).max(300), caption: z.string().max(300).optional(),
    section_heading: z.string().min(1).max(160), position: z.enum(["start", "end"]).optional(),
  }, (a) => edit(a.id, (md) => attachImage(md, { url: a.image_url, alt: a.alt, caption: a.caption }, { heading: a.section_heading, position: a.position })));

  tool("replace_lesson_image", "Swap one image in a lesson draft for another (keeps its place).", "lessons:write", true, {
    id: idOrSlug, old_image_url: z.string().url(), new_image_url: z.string().url(), alt: z.string().max(300).optional(), caption: z.string().max(300).optional(),
  }, (a) => edit(a.id, (md) => replaceImage(md, a.old_image_url, { url: a.new_image_url, alt: a.alt, caption: a.caption })));

  tool("remove_lesson_image", "Remove an image from a lesson draft. Needs the user's agreement.", "lessons:write", true, {
    id: idOrSlug, image_url: z.string().url(), confirm_user_approved: confirm("removing this image"),
  }, (a) => edit(a.id, (md) => removeImage(md, a.image_url)));

  // ------------------------------------------------------------------ D. status and admin
  tool("get_recent_changes", "Latest operations through this gateway (who, what, which lesson, success or failure).", "lessons:read", false, { limit: z.number().int().min(1).max(100).optional() }, async (a) => ({ changes: await audit.recent(env, a.limit ?? 20) }));

  tool("get_system_status", "Is the gateway healthy: database, image storage, publishing switch, version.", "lessons:read", false, {}, async () => {
    const out: Record<string, unknown> = { version: VERSION, publishing_enabled: await state.publishingEnabled(env), site: env.SITE_URL, image_cdn: env.PUBLIC_BASE };
    try { out.database = (await db.ping(env)) ? "ok" : "no answer"; } catch (e: any) { out.database = "error: " + e.message.slice(0, 120); }
    try { await env.BUCKET.list({ limit: 1 }); out.image_storage = "ok"; } catch (e: any) { out.image_storage = "error: " + e.message.slice(0, 120); }
    // describes the configured database key without revealing it: its kind, which project and role it claims, and whether that matches SUPABASE_URL
    {
      const k = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
      const info: Record<string, unknown> = { set: !!k, length: k.length, has_whitespace_or_quotes: /[s"']/.test(k) };
      if (k.startsWith("sb_secret_")) info.format = "new secret key (sb_secret_...)";
      else if (k.startsWith("sb_publishable_")) { info.format = "PUBLISHABLE key (wrong: needs the secret key)"; }
      else if (k.split(".").length === 3) {
        info.format = "JWT";
        try {
          const c = JSON.parse(atob(k.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
          info.role = c.role; info.project_ref = c.ref; info.expires = c.exp ? new Date(c.exp * 1000).toISOString().slice(0, 10) : undefined;
          info.matches_SUPABASE_URL = new URL(env.SUPABASE_URL).hostname.startsWith(String(c.ref) + ".");
        } catch { info.format = "JWT (unreadable: probably damaged or truncated)"; }
      } else if (k) info.format = "unrecognised (not a Supabase key)";
      out.database_key = info;
    }
    out.granted_scopes = p.scope; out.connected_as = client;
    return out;
  });

  tool("admin_list_clients", "Owner only: AI assistants that have been authorized (client and grant).", "admin", false, {}, async () => {
    const clients = await env.OAUTH_PROVIDER.listClients({ limit: 100 });
    return { clients: clients.items.map((c: any) => ({ client_id: c.clientId, name: c.clientName, registered: c.registrationDate })) };
  });
  tool("admin_revoke_client", "Owner only: cut off one assistant (deletes the client and its grants). Others keep working.", "admin", true, {
    client_id: z.string().min(3), confirm_user_approved: confirm("revoking this assistant's access"),
  }, async (a) => { await env.OAUTH_PROVIDER.deleteClient(a.client_id); return { revoked: a.client_id }; });
  tool("admin_set_publishing", "Owner only: switch all writing and publishing off or on (a kill switch).", "admin", false, { enabled: z.boolean() }, async (a) => {
    await state.setPublishing(env, a.enabled);
    await audit.log(env, { client, user: p.email, op: "admin_set_publishing", ok: true, detail: `enabled=${a.enabled}` });
    return { publishing_enabled: a.enabled };
  });
  tool("admin_get_audit_log", "Owner only: the audit log, newest first.", "admin", false, { limit: z.number().int().min(1).max(100).optional() }, async (a) => ({ log: await audit.recent(env, a.limit ?? 50) }));

  return server;
}
