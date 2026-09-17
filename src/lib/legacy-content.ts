const IMAGE_LINE = /^!\[[^\]]*\]\([^\s)]+\)$/;

/**
 * Interleave legacy source images into visual spot questions. Older imports
 * stored prose in `content` and every image in `original_notes`, leaving the
 * public spot cards image-less. Source image order is preserved.
 */
export function mergeVisualSourceImages(content: string, originalNotes: string): string {
  if (!content || content.includes("![")) return content;
  const images = String(originalNotes || "").split(/\r?\n/).map((line) => line.trim()).filter((line) => IMAGE_LINE.test(line));
  if (!images.length) return content;

  let imageIndex = 0;
  const output: string[] = [];
  for (const line of content.replace(/\r\n?/g, "\n").split("\n")) {
    output.push(line);
    if (/^#{2,3}\s+(?:Spot|Plate|Slide|Number|Q(?:uestion)?)\s*\d+/i.test(line.trim()) && imageIndex < images.length) {
      output.push("", images[imageIndex++], "");
    }
  }
  if (imageIndex === 0) return content;
  return output.join("\n").replace(/\n{4,}/g, "\n\n\n");
}
