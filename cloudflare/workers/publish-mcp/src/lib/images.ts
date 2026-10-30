// Image intake: sniff the real file type from its bytes (a name or a Content-Type is not trusted), cap the size, store in R2 under ai/.
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export type ImageKind = { type: "image/jpeg" | "image/png" | "image/webp"; ext: "jpg" | "png" | "webp" };

export function sniffImage(b: Uint8Array): ImageKind | null {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  if (b.length > 12 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return { type: "image/png", ext: "png" };
  if (b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return { type: "image/webp", ext: "webp" };
  return null;
}

export function fromBase64(data: string): Uint8Array {
  const clean = data.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
  if (clean.length > Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 8) throw new Error(`Image too large (limit ${MAX_IMAGE_BYTES / 1048576} MB).`);
  const bin = atob(clean);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function safeName(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "image";
}

export async function storeImage(env: { BUCKET: R2Bucket; PUBLIC_BASE: string }, bytes: Uint8Array, filename: string, meta: { by: string; alt?: string; caption?: string }) {
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error(`Image too large (limit ${MAX_IMAGE_BYTES / 1048576} MB).`);
  const kind = sniffImage(bytes);
  if (!kind) throw new Error("Only JPEG, PNG and WebP images are accepted (the file's bytes were checked, not its name).");
  const d = new Date();
  const key = `ai/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${safeName(filename)}-${crypto.randomUUID().slice(0, 8)}.${kind.ext}`;
  await env.BUCKET.put(key, bytes, {
    httpMetadata: { contentType: kind.type, cacheControl: "public, max-age=31536000, immutable" },
    customMetadata: { by: meta.by, alt: (meta.alt ?? "").slice(0, 300), caption: (meta.caption ?? "").slice(0, 300) },
  });
  return { key, url: `${env.PUBLIC_BASE.replace(/\/+$/, "")}/${key}`, bytes: bytes.length, type: kind.type };
}

// Signed one-shot upload links, for assistants that cannot send file bytes through a tool call. HMAC over "<exp>.<by>.<n>".
const hmac = async (secret: string, msg: string) => {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)))].map((x) => x.toString(16).padStart(2, "0")).join("");
};

export async function signUploadToken(secret: string, by: string, ttlSeconds = 600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds, nonce = crypto.randomUUID().slice(0, 12);
  const body = `${exp}.${encodeURIComponent(by)}.${nonce}`;
  return { token: `${body}.${await hmac(secret, body)}`, nonce, exp };
}

export async function checkUploadToken(secret: string, token: string): Promise<{ by: string; nonce: string } | null> {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [exp, by, nonce, sig] = parts;
  if (Number(exp) < Date.now() / 1000) return null;
  const want = await hmac(secret, `${exp}.${by}.${nonce}`);
  if (want.length !== sig.length) return null;
  let diff = 0; for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? { by: decodeURIComponent(by), nonce } : null;
}
