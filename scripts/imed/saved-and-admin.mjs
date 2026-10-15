// One-off: the saved-notes shelf on /notes, and the admin comments page in the routes, tools list and sidebar.
import fs from "node:fs";
function edit(file, fn) {
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  const out = fn(raw.replace(/\r\n/g, "\n"));
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, "\r\n") : out);
}
const swap = (s, x, y) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 80)); return s.replace(x, y); };

edit("src/pages/StaticNotesIndex.tsx", (s) => {
  if (s.includes("savedNotes")) return s;
  s = swap(s, 'import { unfinished } from "@/lib/noteProgress";', 'import { unfinished } from "@/lib/noteProgress";\nimport { savedNotes } from "@/lib/savedNotes";');
  s = swap(s, "  const imedWritten = ", "  const shelf = useMemo(() => savedNotes(user?.id).map((slug) => NOTES.find((n) => n.slug === slug)).filter((n): n is StaticNote => Boolean(n)).slice(0, 6), [user?.id]);\n  const imedWritten = ");
  s = swap(s, '      <div className="mt-5 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Year">', `      {shelf.length > 0 && (
        <section className="mt-5 rounded-2xl border border-border bg-card p-4" aria-label="Saved for later">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Saved for later</p>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">{shelf.map((n) => <li key={n.slug}><Link to={\`/notes/\${n.slug}\`} className="block truncate rounded-lg bg-background px-3 py-2 text-sm font-semibold hover:text-primary">{n.title}</Link></li>)}</ul>
        </section>
      )}

      <div className="mt-5 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Year">`);
  return s;
});

edit("src/App.tsx", (s) => {
  if (s.includes("AdminComments")) return s;
  s = swap(s, 'const AdminDrafts = lazy', 'const AdminComments = lazy(() => import("./pages/AdminComments"));\nconst AdminDrafts = lazy');
  s = swap(s, '            <Route path="/admin/drafts"', '            <Route path="/admin/comments" element={<AdminRoute><AdminComments /></AdminRoute>} />\n            <Route path="/admin/drafts"');
  return s;
});
edit("src/pages/AdminTools.tsx", (s) => (s.includes("/admin/comments") ? s : swap(s, "const TOOLS = [", 'const TOOLS = [\n  { to: "/admin/comments", icon: HeartPulse, title: "Comments", text: "The newest questions and comments under the notes, with one tap to hide or delete." },')));
edit("src/pages/Admin.tsx", (s) => (s.includes("route:/admin/comments") ? s : swap(s, '    { id: "route:/admin/drafts",', '    { id: "route:/admin/comments", label: "Comments", icon: Bell },\n    { id: "route:/admin/drafts",')));
console.log("done");
