// Two statements the cross-check flagged in the Ascites note, both confirmed by hand: shifting dullness moves to the DEPENDENT flank, and SBP recurrence is quoted as 40 to 70% in a year.
import fs from "node:fs";
const f = "src/content/notes/gastroenterology-ascites-sbp.md";
let s = fs.readFileSync(f, "utf8");
const swap = (x, y) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 70)); s = s.replace(x, y); };
swap("roll them onto their side and wait about a minute. The dull area moves up to the new uppermost flank. It is the most useful single test.", "roll them onto one side and wait about a minute, then percuss again. The fluid falls to the dependent (lower) flank, so that flank is now dull and the upper flank, where the gas-filled bowel has floated up, becomes resonant. Dullness that shifts like this is the most useful single test.");
swap("about **70% within a year** without prophylaxis, and much lower with it", "about **40 to 70% within a year** without prophylaxis, and much lower with it");
fs.writeFileSync(f, s);
console.log("ascites note corrected");
