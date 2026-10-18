// Shared by the topic page, the build-time prerender and the share-card route (plain JS so Node scripts can import it too).

const GENERIC = new Set(("types type part parts clinical significance specific sequence sequences multiple choice must know level levels output diagnostic criteria management treatment " +
  "features feature causes cause general common important normal abnormal other note notes question questions answer answers key points point summary overview introduction " +
  "classification definition mechanism mechanisms investigation investigations method methods group groups case cases study studies example examples list lists section sections " +
  "page pages total final first second third mount kenya").split(/\s+/));

/** Phrases that were lifted from sentences and headings ("Types of", "Part 4 of 4", "Clinical Significance") are not subjects a student searches for: no topic page, no indexing. */
export function isJunkTopic(name) {
  const n = String(name || "").trim();
  if (n.length < 4) return true;
  if (/\b(of|and|the|in|to|for|with|on|by)$/i.test(n)) return true;           // cut off mid-phrase
  if (/^(of|and|the|in|to|for|with|on|by)\b/i.test(n)) return true;
  if (/\b\d+\s*(of|\/)\s*\d+\b/i.test(n) || /^part\s*\d+/i.test(n)) return true;      // "Part 4 of 4"
  const words = n.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/[\s-]+/).filter(Boolean);
  return words.length > 0 && words.every((w) => GENERIC.has(w) || /^\d+$/.test(w));
}

const DISEASE_DOMAINS = /pathology|medicine|paediatrics|pediatrics|obstetrics|gynaecology|psychiatry|surgery|infect|microbiology/i;

/** A title that fits the kind of subject: diseases get "causes and management", structures and processes get "explained". */
export function topicTitle(name, category) {
  const tail = DISEASE_DOMAINS.test(String(category || "")) ? "overview, causes, management and practice questions" : "notes, explained simply, with practice questions";
  return `${name}: ${tail} | Ompath Study`;
}
