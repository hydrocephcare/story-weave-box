// One-off: the drug chips under a note open the drug's card in a pop-up on the same page (no leaving the note), with a link to its full page.
import fs from "node:fs";
const f = "src/components/PharmacologyConnections.tsx";
const raw = fs.readFileSync(f, "utf8");
const crlf = raw.includes("\r\n");
let s = raw.replace(/\r\n/g, "\n");
if (s.includes("DrugPeekBody")) { console.log("already done"); process.exit(0); }
const need = (x) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 80)); };

need('import { Pill } from "lucide-react";');
s = s.replace('import { Pill } from "lucide-react";', 'import { useState } from "react";\nimport { Pill } from "lucide-react";\nimport { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";\nimport DrugPeekBody from "@/components/DrugPeekBody";');
need("  const conditions = conditionIds.map");
s = s.replace("  const conditions = conditionIds.map", "  const [peek, setPeek] = useState<string | null>(null);\n  const conditions = conditionIds.map");
need("onClick={() => leave(drugHref(id))}");
s = s.replace("onClick={() => leave(drugHref(id))}", "onClick={() => setPeek(id)}");
s = s.replace("Drugs in this note. Tap one for its card, then use Back to return to this spot.", "Drugs in this note. Tap one to read its card here.");
need("    </aside>\n  );");
s = s.replace("    </aside>\n  );", `      <Dialog open={peek !== null} onOpenChange={(o) => { if (!o) setPeek(null); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogTitle className="sr-only">Drug card</DialogTitle>
          <DialogDescription className="sr-only">The drug's group, uses, cautions and monitoring.</DialogDescription>
          {peek && <DrugPeekBody id={peek} />}
          {peek && <button type="button" onClick={() => { const id = peek; setPeek(null); leave(drugHref(id)); }} className="mt-2 text-sm font-bold text-primary hover:underline">Open the full drug page →</button>}
        </DialogContent>
      </Dialog>
    </aside>
  );`);
fs.writeFileSync(f, crlf ? s.replace(/\n/g, "\r\n") : s);
console.log("drug pop-up added");
