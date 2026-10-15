// One-off: the Activity page shows how many accounts and visitors the site has, and congratulates you when a round number is passed.
import fs from "node:fs";
const f = "src/pages/AdminActivity.tsx";
const raw = fs.readFileSync(f, "utf8");
const crlf = raw.includes("\r\n");
let s = raw.replace(/\r\n/g, "\n");
if (s.includes("MILESTONES")) { console.log("already done"); process.exit(0); }
const swap = (x, y) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 80)); s = s.replace(x, y); };

swap("type Db = { from: (t: string) => any };", `type Db = { from: (t: string) => any; rpc: (f: string, a?: Record<string, unknown>) => Promise<{ data: any; error: unknown }> };
const MILESTONES = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
const passed = (n: number) => [...MILESTONES].reverse().find((m) => n >= m) ?? 0;`);

swap("  const [keyMsg, setKeyMsg] = useState(\"\");", `  const [keyMsg, setKeyMsg] = useState("");
  const [growth, setGrowth] = useState<{ accounts: number; newWeek: number; visitors: number; online: number } | null>(null);
  const [party, setParty] = useState<string[]>([]);
  useEffect(() => {
    (async () => {
      const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const [all, fresh, stats] = await Promise.all([
        db.from("profiles").select("user_id", { count: "exact", head: true }),
        db.from("profiles").select("user_id", { count: "exact", head: true }).gte("created_at", weekAgo),
        db.rpc("admin_site_stats", { p_days: 7 }),
      ]);
      const g = { accounts: all.count ?? 0, newWeek: fresh.count ?? 0, visitors: Number(stats.data?.totals?.visitors ?? 0), online: Number(stats.data?.online?.total ?? 0) };
      setGrowth(g);
      // congratulate once for each round number passed (remembered on this device)
      try {
        const seen = JSON.parse(localStorage.getItem("ompath_milestones") ?? "{}") as Record<string, number>;
        const notes: string[] = [];
        const a = passed(g.accounts); if (a > (seen.accounts ?? 0)) { notes.push(\`Congratulations! \${a.toLocaleString()} people now have an account on Ompath Study.\`); seen.accounts = a; }
        const v = passed(g.visitors); if (v > (seen.visitors ?? 0)) { notes.push(\`Congratulations! \${v.toLocaleString()} different people visited in the last 7 days.\`); seen.visitors = v; }
        localStorage.setItem("ompath_milestones", JSON.stringify(seen));
        setParty(notes);
      } catch { /* storage blocked */ }
    })();
  }, [db]);`);

swap("      {busy ? <Loader2 className=\"mt-8 h-6 w-6 animate-spin text-primary\" /> : (", `      {party.map((p) => (
        <div key={p} role="status" className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-amber-400/50 bg-gradient-to-r from-amber-400/20 via-amber-300/10 to-transparent p-4"><p className="font-serif text-lg font-bold">🎉 {p}</p><button type="button" onClick={() => setParty((x) => x.filter((y) => y !== p))} className="text-xs font-bold text-muted-foreground hover:text-foreground">Thanks</button></div>
      ))}
      {growth && (
        <section className="mt-6 grid gap-3 sm:grid-cols-4" aria-label="Growth">
          <div className="rounded-xl border border-border p-4"><p className="text-3xl font-bold text-primary">{growth.accounts.toLocaleString()}</p><p className="text-sm text-muted-foreground">accounts (signed up)</p></div>
          <div className="rounded-xl border border-border p-4"><p className="text-3xl font-bold text-primary">+{growth.newWeek.toLocaleString()}</p><p className="text-sm text-muted-foreground">new accounts this week</p></div>
          <div className="rounded-xl border border-border p-4"><p className="text-3xl font-bold text-primary">{growth.visitors.toLocaleString()}</p><p className="text-sm text-muted-foreground">different visitors, 7 days</p></div>
          <div className="rounded-xl border border-border p-4"><p className="text-3xl font-bold text-primary">{growth.online.toLocaleString()}</p><p className="text-sm text-muted-foreground">online right now</p></div>
        </section>
      )}
      {growth && <p className="mt-2 text-xs text-muted-foreground">A visitor is one network address per week, so the same laptop in two browsers counts once. People sharing a campus network can count as one.</p>}
      {busy ? <Loader2 className="mt-8 h-6 w-6 animate-spin text-primary" /> : (`);
fs.writeFileSync(f, crlf ? s.replace(/\n/g, "\r\n") : s);
console.log("growth card added");
