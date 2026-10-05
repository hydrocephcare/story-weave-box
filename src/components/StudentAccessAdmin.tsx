import { useEffect, useState } from "react";
import { Check, Loader2, UserPlus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface Row { user_id: string; email: string | null; admission_no: string | null; entered_text: string | null; status: "verified" | "pending" | "denied"; method: string; note: string | null; created_at: string }

// The generated database types do not list these yet.
const db = supabase as unknown as {
  from: (t: string) => { select: (c: string) => { order: (k: string, o: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: Row[] | null; error: { message: string } | null }> } } };
  rpc: (n: string, a?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

/** Admin: who may open books, timetables, outlines and past papers. Requests whose admission number did not match wait here. */
export default function StudentAccessAdmin() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [adm, setAdm] = useState("");
  const [tab, setTab] = useState<"pending" | "verified" | "denied">("pending");

  const load = async () => {
    const { data, error } = await db.from("student_access").select("user_id,email,admission_no,entered_text,status,method,note,created_at").order("created_at", { ascending: false }).limit(500);
    if (error) toast({ title: "Could not load students", description: error.message, variant: "destructive" });
    setRows(data ?? []);
    setLoading(false);
    void db.rpc("admin_mark_requests_seen");
  };
  useEffect(() => { void load(); }, []);

  const review = async (r: Row, approve: boolean) => {
    setBusy(r.user_id);
    const { error } = await db.rpc("admin_review_student", { _uid: r.user_id, _approve: approve });
    setBusy(null);
    if (error) return toast({ title: "Could not save", description: error.message, variant: "destructive" });
    toast({ title: approve ? "Access approved" : "Access removed", description: r.email ?? "" });
    void load();
  };

  const add = async () => {
    if (!email.trim()) return;
    setBusy("add");
    const { data, error } = await db.rpc("admin_add_student", { _email: email.trim(), _admission: adm.trim() || null });
    setBusy(null);
    if (error) return toast({ title: "Could not add", description: error.message, variant: "destructive" });
    if (data === "no-account") return toast({ title: "No account with that email", description: "They need to sign up first, then you can approve them here.", variant: "destructive" });
    toast({ title: "Student added" });
    setEmail(""); setAdm("");
    void load();
  };

  const counts = { pending: 0, verified: 0, denied: 0 };
  rows.forEach((r) => { counts[r.status]++; });
  const shown = rows.filter((r) => r.status === tab);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-serif text-xl font-bold text-foreground">MKU students</h2>
        <p className="text-sm text-muted-foreground">Only verified students can open books, timetables, course outlines, the library and past papers. A student whose admission number did not match appears under Pending.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["pending", "verified", "denied"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-full border px-3.5 py-1.5 text-[13px] font-bold capitalize ${tab === t ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:border-primary/50"}`}>
            {t} <span className="opacity-70">{counts[t]}</span>
          </button>
        ))}
      </div>

      {loading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nobody here.</p>
      ) : (
        <ul className="grid gap-2">
          {shown.map((r) => (
            <li key={r.user_id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{r.email ?? r.user_id}</p>
                <p className="text-xs text-muted-foreground">
                  {r.admission_no ?? (r.entered_text ? `Typed: ${r.entered_text}` : "No admission number")}
                  {r.note ? ` · ${r.note}` : ""} · {new Date(r.created_at).toLocaleDateString()}
                </p>
              </div>
              {r.status !== "verified" && <Button size="sm" disabled={busy === r.user_id} onClick={() => review(r, true)} className="gap-1.5"><Check className="h-4 w-4" /> Approve</Button>}
              {r.status !== "denied" && <Button size="sm" variant="outline" disabled={busy === r.user_id} onClick={() => review(r, false)} className="gap-1.5"><X className="h-4 w-4" /> {r.status === "verified" ? "Remove access" : "Deny"}</Button>}
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-xl border border-border bg-card p-4">
        <p className="mb-2 text-sm font-semibold text-foreground">Add a student by hand</p>
        <div className="flex flex-wrap gap-2">
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Their account email" type="email" className="min-w-[14rem] flex-1" />
          <Input value={adm} onChange={(e) => setAdm(e.target.value)} placeholder="Admission number (optional)" className="min-w-[12rem] flex-1" />
          <Button onClick={add} disabled={busy === "add" || !email.trim()} className="gap-1.5"><UserPlus className="h-4 w-4" /> Add</Button>
        </div>
      </div>
    </div>
  );
}
