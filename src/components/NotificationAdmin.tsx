import { useEffect, useState } from "react";
import { Bell, Loader2, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type Campaign = { id: string; title: string; audience: string; status: string; recipient_count: number; delivered_count: number; failed_count: number; created_at: string };

export default function NotificationAdmin() {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [actionUrl, setActionUrl] = useState("");
  const [audience, setAudience] = useState("all_users");
  const [year, setYear] = useState("3");
  const [sending, setSending] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  const loadCampaigns = async () => {
    const { data } = await (supabase as any).from("notification_campaigns").select("id,title,audience,status,recipient_count,delivered_count,failed_count,created_at").order("created_at", { ascending: false }).limit(20);
    setCampaigns(data || []);
  };
  useEffect(() => { void loadCampaigns(); }, []);

  const send = async () => {
    if (!title.trim() || !message.trim()) return toast({ title: "Add a title and message", variant: "destructive" });
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-notification", { body: {
        title: title.trim(), message: message.trim(), action_url: actionUrl.trim() || null,
        audience, study_year: audience === "study_year" ? Number(year) : null,
      } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: `Notification created for ${data.recipients} user${data.recipients === 1 ? "" : "s"}`, description: data.email_configured ? `${data.delivered} emails delivered.` : "In-app notifications saved. Add RESEND_API_KEY to enable email delivery." });
      setTitle(""); setMessage(""); setActionUrl("");
      await loadCampaigns();
    } catch (error: any) {
      toast({ title: "Could not send notification", description: error.message, variant: "destructive" });
    } finally { setSending(false); }
  };

  return <div className="space-y-6">
    <div>
      <h2 className="flex items-center gap-2 font-serif text-xl font-bold"><Bell className="h-5 w-5 text-primary" /> Notifications</h2>
      <p className="mt-1 text-sm text-muted-foreground">Send a secure account notification to registered learners, active subscribers, or one study year. Email is sent only to users who have not opted out.</p>
    </div>
    <div className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div><label className="mb-1.5 block text-sm font-medium">Audience</label><Select value={audience} onValueChange={setAudience}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all_users">All logged-in users</SelectItem><SelectItem value="subscribers">Active subscribers only</SelectItem><SelectItem value="study_year">One study year</SelectItem></SelectContent></Select></div>
      {audience === "study_year" && <div><label className="mb-1.5 block text-sm font-medium">Study year</label><Select value={year} onValueChange={setYear}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[1,2,3,4,5,6].map((n) => <SelectItem key={n} value={String(n)}>Year {n}</SelectItem>)}</SelectContent></Select></div>}
      <div><label className="mb-1.5 block text-sm font-medium">Email subject / notification title</label><Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="New Year 3 haematology revision set" /></div>
      <div><label className="mb-1.5 block text-sm font-medium">Message</label><Textarea value={message} maxLength={4000} onChange={(e) => setMessage(e.target.value)} className="min-h-32" placeholder="Tell learners what is new and why it matters…" /><p className="mt-1 text-right text-xs text-muted-foreground">{message.length}/4000</p></div>
      <div><label className="mb-1.5 block text-sm font-medium">Optional Ompath Study link</label><Input value={actionUrl} onChange={(e) => setActionUrl(e.target.value)} placeholder="https://www.ompathstudy.com/revision-index" /></div>
      <Button onClick={send} disabled={sending} className="w-full gap-2 sm:w-auto">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send notification</Button>
    </div>
    <div><h3 className="mb-3 font-semibold">Recent sends</h3><div className="space-y-2">{campaigns.length === 0 ? <p className="text-sm text-muted-foreground">No notifications sent yet.</p> : campaigns.map((item) => <div key={item.id} className="rounded-lg border border-border p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{item.title}</strong><span className="rounded-full bg-secondary px-2 py-0.5 text-xs capitalize">{item.status}</span></div><p className="mt-1 text-xs text-muted-foreground">{item.audience.replace("_", " ")} · {item.recipient_count} recipients · {item.delivered_count} emails sent{item.failed_count ? ` · ${item.failed_count} failed` : ""} · {new Date(item.created_at).toLocaleString()}</p></div>)}</div></div>
  </div>;
}
