import { DEFAULT_SITE_SETTINGS } from "@/lib/site-settings";

/**
 * Strip real lecturer / teacher names out of rendered content.
 *
 * Papers pasted from class handouts often carry a lecturer's name ("Dr Beda",
 * "notes by Beda"). Those must never surface on the site, so we scrub them at
 * render time — the stored source is left untouched.
 */
export function redactNames(text: string, names: string[] = DEFAULT_SITE_SETTINGS.redactedNames): string {
  if (!text) return text;
  let out = text;
  for (const raw of names) {
    const name = raw.trim();
    if (name.length < 3) continue;
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // "Dr. Beda", "by Beda", "— Beda" and bare mentions.
    out = out
      .replace(new RegExp(`\\s*[—–-]\\s*(?:Dr\\.?|Prof\\.?|Mr\\.?|Mrs\\.?|Ms\\.?)?\\s*${esc}\\b`, "gi"), "")
      .replace(new RegExp(`\\b(?:by|per|from|courtesy of)\\s+(?:Dr\\.?|Prof\\.?|Mr\\.?|Mrs\\.?|Ms\\.?)?\\s*${esc}\\b`, "gi"), "")
      .replace(new RegExp(`\\b(?:Dr\\.?|Prof\\.?|Mr\\.?|Mrs\\.?|Ms\\.?)\\s*${esc}\\b`, "gi"), "the lecturer")
      .replace(new RegExp(`\\b${esc}(?:'s)?\\b`, "g"), "");
  }
  return out.replace(/[ \t]{2,}/g, " ").replace(/\(\s*\)/g, "").replace(/\s+([.,;:])/g, "$1");
}