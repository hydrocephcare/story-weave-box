import { uploadImageToR2 } from "@/lib/r2";

/** Shrinks a photo to a sensible size (long side 1600px, JPEG) so a 12 MB phone picture uploads fast and loads fast for readers. */
async function shrink(file: File, maxSide = 1600): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch { return file; }
}

/** Uploads a story picture and returns its web address. Throws a friendly error rather than saving a huge inline copy. */
export async function uploadStoryImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose a picture.");
  if (file.size > 20 * 1024 * 1024) throw new Error("That picture is too large (20 MB at most).");
  const small = await shrink(file);
  const url = await uploadImageToR2(small);
  if (!/^https:\/\//i.test(url)) throw new Error("The picture could not be uploaded. Check your connection and try again.");
  return url;
}
