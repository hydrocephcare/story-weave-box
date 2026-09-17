import { supabase } from "@/integrations/supabase/client";

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
 * Uploads an image to Cloudflare R2 and returns its public URL.
 * Falls back to the inline base64 data URL if the upload fails, so
 * publishing never breaks because of a network hiccup.
 */
export async function uploadImageToR2(file: File): Promise<string> {
  const dataUrl = await readAsDataUrl(file);
  try {
    const { data, error } = await supabase.functions.invoke("r2-upload", {
      body: { dataUrl, filename: file.name },
    });
    if (error) throw error;
    if (!data?.url) throw new Error(data?.error || "no url returned");
    // The deployed edge function may briefly lag behind source changes. Never
    // persist the SPA hostname for R2 objects: it serves HTML for /uploads/*.
    return normalizeR2PublicUrl(data.url as string);
  } catch (e) {
    console.error("R2 upload failed, keeping inline image", e);
    return dataUrl;
  }
}
