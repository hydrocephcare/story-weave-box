// Shortens the long, sometimes cut-off captions that came with the Wikimedia pictures to one clean sentence (or the note's own title), keeping the credit.
//   node scripts/imed/tidy-captions.mjs file.md ...
import fs from "node:fs";
const notes = JSON.parse(fs.readFileSync("src/data/staticNotes.json", "utf8"));
for (const f of process.argv.slice(2)) {
  const title = notes.find((n) => n.file === f.replace(/\\/g, "/"))?.title ?? "Illustration";
  let md = fs.readFileSync(f, "utf8");
  md = md.replace(/^!\[([^\]]*)\]\((https:\/\/upload\.wikimedia\.org[^)]*)\)\s*$/gm, (all, cap, url) => {
    const m = cap.match(/^(.*)\.\s+([^.]*)$/s); // "description. credit"
    const credit = m ? m[2].trim() : "Wikimedia Commons";
    const desc = (m ? m[1] : cap).replace(/\s+/g, " ").trim();
    const first = desc.split(/(?<=[a-z0-9)])\.\s/)[0].replace(/\.+$/, "");
    const good = first.length >= 12 && first.length <= 110 && !/^figure\b/i.test(first) && !/\b(maj|the|and|of|a|in)$/i.test(first);
    return `![${good ? first : title}. ${credit}](${url})`;
  });
  fs.writeFileSync(f, md);
}
