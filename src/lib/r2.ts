import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase-config";
import { reportError } from "@/lib/errorReport";

// Pictures go to the site's own upload service (a Cloudflare Worker that stores them in R2). Signed-in students may add story pictures; admins may add anything.
const UPLOAD_URL = "https://ompath-r2-upload.hydrocephcare.workers.dev";

const normalizeR2PublicUrl = (url: string): string =>
  url.replace(
    /^https?:\/\/(?:www\.)?ompathstudy\.com(?=\/uploads\/)/i,
    "https://cdn.ompathstudy.com",
  );

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Uploads an image and returns its public web address. A failure is a plain, readable error (never a huge inline copy),
 * and it is also sent to the admin automatically.
 */
export async function uploadImageToR2(file: File): Promise<string> {
  const { data: s } = await supabase.auth.getSession();
  const token = s.session?.access_token;
  if (!token) throw new Error("Please log in to add a picture.");
  const dataUrl = await readAsDataUrl(file);
  let res: Response;
  try {
    res = await fetch(UPLOAD_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_PUBLISHABLE_KEY, "content-type": "application/json" },
      body: JSON.stringify({ dataUrl, filename: file.name }),
    });
  } catch (e) {
    reportError("upload", `Picture upload could not reach the upload service: ${(e as Error).message}`);
    throw new Error("The picture could not be uploaded. Check your connection and try again.");
  }
  const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !j.url) {
    reportError("upload", `Picture upload refused (${res.status}): ${j.error ?? "no reason"}`, { type: file.type, size: file.size });
    throw new Error(res.status === 429 || res.status === 400 ? (j.error ?? "The picture could not be uploaded.") : "The picture could not be uploaded right now. The admin has been told.");
  }
  return normalizeR2PublicUrl(j.url);
}
