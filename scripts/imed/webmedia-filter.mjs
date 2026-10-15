// One-off: topic page pictures must be medical. A search for "Consolidation" returned photos of an air force medical group opening a building; pictures found by
// searching Commons now need a medical word in their description or file name and may not be about the military, buildings, ceremonies or people posing.
import fs from "node:fs";
const f = "src/lib/webMedia.ts";
const raw = fs.readFileSync(f, "utf8");
const crlf = raw.includes("\r\n");
let s = raw.replace(/\r\n/g, "\n");
if (s.includes("NOT_CLINICAL")) { console.log("already done"); process.exit(0); }
const need = (x) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 80)); };

need("const OK_LICENCE =");
s = s.replace("const OK_LICENCE =", `// a picture found by searching must look clinical, and must not be about the military, buildings, ceremonies or groups of people
const NOT_CLINICAL = /air force|army|navy|military|squadron|\\bbase\\b|troops?|soldier|veteran|ceremon|ribbon|opening of|celebrat|\\bgroup\\b|staff|team|building|campus|hospital (entrance|exterior)|facility|award|graduat|portrait|president|general\\b|colonel|captain/i;
const CLINICAL = /x-?ray|radiograph|ct\\b|mri|scan|ultrasound|histolog|patholog|microscop|stain|biopsy|specimen|anatom|diagram|illustration|lesion|rash|clinical|patient|disease|syndrome|infection|tumou?r|cancer|lung|heart|liver|kidney|brain|blood|cell|bacteri|virus|parasite|drug|ecg|ekg|angiogra|endoscop|gross/i;
const clinicalPic = (t: string, file: string) => !NOT_CLINICAL.test(\`\${t} \${file}\`) && CLINICAL.test(\`\${t} \${file}\`);
const OK_LICENCE =`);

// pictures found by searching Commons: keep only the clinical ones
need("      if (pics.length) result = {");
s = s.replace("      if (pics.length) result = {", "      const clinical = pics.filter((p) => clinicalPic(p.title, p.u));\n      if (clinical.length) result = {");
s = s.replace("hero: pics[0], more: pics.slice(1, 7) };", "hero: clinical[0], more: clinical.slice(1, 7) };");
// pictures taken from the article itself: drop the obviously non-clinical ones
need("      const gallery = await describeFiles(files.slice(0, 14)).catch(() => []);");
s = s.replace("      const gallery = await describeFiles(files.slice(0, 14)).catch(() => []);", "      const gallery = (await describeFiles(files.slice(0, 14)).catch(() => [])).filter((g) => !NOT_CLINICAL.test(`${g.title} ${g.u}`));");
fs.writeFileSync(f, crlf ? s.replace(/\n/g, "\r\n") : s);
console.log("webmedia filter applied");
