// One-off: every admin page that lives at its own address is wrapped in the admin menu; the book-access page is added; the access page uses the shared helper.
import fs from "node:fs";
function edit(file, fn) {
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  const out = fn(raw.replace(/\r\n/g, "\n"));
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, "\r\n") : out);
}
const swap = (s, x, y) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 80)); return s.replace(x, y); };

edit("src/App.tsx", (s) => {
  if (s.includes("AdminPage")) return s;
  s = swap(s, 'import { AdminRoute, SignedInRoute, StudentRoute } from "@/components/AccessRoute";', 'import { AdminRoute, SignedInRoute, StudentRoute } from "@/components/AccessRoute";\nimport AdminShell from "@/components/admin/AdminShell";');
  s = swap(s, 'const AdminComments = lazy', 'const AdminAccess = lazy(() => import("./pages/AdminAccess"));\nconst AdminComments = lazy');
  // an admin page with the menu around it
  s = swap(s, "const App = () => (", 'const AdminPage = ({ children }: { children: React.ReactNode }) => <AdminRoute><AdminShell>{children}</AdminShell></AdminRoute>;\n\nconst App = () => (');
  // every /admin/<tool> route that renders a page (not a redirect) gets the menu
  s = s.replace(/(<Route path="\/admin\/[^"]+" element=\{)<AdminRoute>(<(?!Navigate)[A-Za-z]+ \/>)<\/AdminRoute>(\} \/>)/g, "$1<AdminPage>$2</AdminPage>$3");
  s = swap(s, '            <Route path="/admin/comments"', '            <Route path="/admin/access" element={<AdminPage><AdminAccess /></AdminPage>} />\n            <Route path="/admin/comments"');
  return s;
});

edit("src/pages/AdminAccess.tsx", (s) => {
  const a = s.indexOf("/** Turns an example admission number");
  const b = s.indexOf("/** /admin/access:");
  if (a < 0 || b < 0) throw new Error("helper block not found");
  s = s.slice(0, a) + s.slice(b);
  s = swap(s, 'import { supabase } from "@/integrations/supabase/client";', 'import { supabase } from "@/integrations/supabase/client";\nimport { ruleFromExample, ruleMatches } from "@/lib/admissionRule";');
  s = swap(s, "rules.find((r) => r.active && matches(r, probe))", "rules.find((r) => r.active && ruleMatches(r.pattern, probe))");
  return s;
});

edit("src/pages/AdminTools.tsx", (s) => (s.includes("/admin/access") ? s : swap(s, "const TOOLS = [", 'const TOOLS = [\n  { to: "/admin/access", icon: HeartPulse, title: "Book access rules", text: "Which admission numbers open the books and papers (BMS/2023/60482, MBCHB…). Add a format from one example; matching students are verified automatically." },')));
console.log("wired");
