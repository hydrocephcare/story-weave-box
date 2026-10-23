import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, HardDrive, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const OAUTH_FUNCTION = "google-drive-oauth";

export default function GoogleDriveImportAdmin() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [folderId, setFolderId] = useState("1WlGy6RNS6ICDqik8DzJ9T5avvjjRE9Ng");
  const [job, setJob] = useState<any>(null);
  const [pending, setPending] = useState(0);
  const [autoRunning, setAutoRunning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [testing, setTesting] = useState(false);

  const loadJob = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("google-drive-import", { body: { action: "status" } });
      if (error) throw error;
      const latest = data?.jobs?.[0] ?? null;
      setJob(latest);
      if (latest?.id) {
        const { data: status } = await supabase.functions.invoke("google-drive-import", { body: { action: "status", job_id: latest.id } });
        setPending(status?.pending ?? 0);
      }
    } catch { /* no job yet */ }
  };

  const loadConnection = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("google_drive_connections")
        .select("google_email")
        .maybeSingle();
      if (error) throw error;
      setEmail((data as { google_email?: string } | null)?.google_email ?? null);
    } catch (err: any) {
      toast({ title: "Could not check Google Drive connection", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConnection();
    loadJob();
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== "https://strfwaqvxvkhjbqrwmla.supabase.co") return;
      if (event.data?.source === "ompathstudy-google-drive") loadConnection();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const testConnection = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-drive-import", { body: { action: "test", folder_id: folderId } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast({ title: "Google Drive test passed", description: `${data.folder?.name || "Folder"} is visible. ${data.child_count ?? 0} immediate items found.` });
    } catch (err: any) {
      toast({ title: "Google Drive test failed", description: err.message, variant: "destructive" });
    } finally { setTesting(false); }
  };

  const startImport = async () => {
    if (!email) {
      toast({ title: "Connect Google Drive first", variant: "destructive" });
      return;
    }
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-drive-import", { body: { action: "start", folder_id: folderId } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setJob(data.job);
      toast({ title: "Year 1 links queued", description: "The importer will index the Drive folder and save links only. Your files stay in Google Drive." });
      await runImport(data.job.id);
    } catch (err: any) {
      toast({ title: "Could not start import", description: err.message, variant: "destructive" });
      setImporting(false);
    }
  };

  const runImport = async (jobId: string) => {
    setImporting(true);
    try {
      for (let i = 0; i < 5000; i++) {
        const { data, error } = await supabase.functions.invoke("google-drive-import", { body: { action: "process", job_id: jobId } });
        if (error) throw new Error(error.message);
        if (data?.error) throw new Error(data.error);
        const { data: status, error: statusError } = await supabase.functions.invoke("google-drive-import", { body: { action: "status", job_id: jobId } });
        if (statusError) throw new Error(statusError.message);
        setJob(status?.job ?? null);
        setPending(status?.pending ?? 0);
        if (data?.done || status?.job?.status === "completed") break;
      }
    } catch (err: any) {
      toast({ title: "Import paused", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
      await loadJob();
    }
  };

  const connect = async () => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke(OAUTH_FUNCTION, { body: {} });
      if (error) throw new Error(error.message);
      if (!data?.auth_url) throw new Error("Google authorization URL was not returned.");
      const popup = window.open(data.auth_url, "ompathstudy-google-drive", "popup,width=620,height=760");
      if (!popup) {
        window.location.href = data.auth_url;
        return;
      }
      toast({ title: "Google authorization opened", description: "Approve access to the account that can view the Year 1 Drive folder." });
    } catch (err: any) {
      toast({ title: "Could not start Google authorization", description: err.message, variant: "destructive" });
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="rounded-lg bg-primary/10 p-2"><HardDrive className="h-5 w-5 text-primary" /></div>
          <div>
            <h2 className="font-serif text-xl font-bold text-foreground">Google Drive Import</h2>
            <p className="text-sm text-muted-foreground">Connect the Google account that has Viewer access to the Year 1 resource folder.</p>
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-border bg-background p-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Checking connection…</div>
          ) : email ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                <span>Connected as <strong>{email}</strong></span>
              </div>
              <Button variant="outline" size="sm" onClick={connect} disabled={connecting} className="gap-2">
                {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Reconnect
              </Button>
            </div>
          ) : (
            <Button onClick={connect} disabled={connecting} className="gap-2">
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              Connect Google Drive
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-semibold text-foreground mb-1">Year 1 source folder</h3>
        <p className="text-sm text-muted-foreground mb-3">The importer will read this folder recursively. Your Google account must be able to view its contents.</p>
        <input
          value={folderId}
          onChange={(e) => setFolderId(e.target.value.trim())}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          aria-label="Google Drive folder ID"
        />
        <p className="mt-2 text-xs text-muted-foreground">Folder ID from the shared Drive URL. The importer scans recursively and saves Google Drive links only. It never copies the files.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" onClick={testConnection} disabled={!email || testing || importing} className="gap-2">\n            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}\n            {testing ? "Testing…" : "Test folder access"}\n          </Button>\n          <Button onClick={startImport} disabled={!email || importing || testing} className="gap-2">
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
            {importing ? "Indexing…" : "Index Year 1 links"}
          </Button>
          {job?.id && job.status !== "completed" && !importing && (
            <Button variant="outline" onClick={() => runImport(job.id)} className="gap-2">
              <RefreshCw className="h-4 w-4" /> Resume indexing
            </Button>
          )}
        </div>
        {job && (
          <div className="mt-4 rounded-lg border border-border bg-background p-4 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <span>Status: <strong>{job.status}</strong></span>
              <span>Pending: <strong>{pending}</strong></span>
              <span>Imported: <strong>{job.completed_items ?? 0}</strong></span>
              <span>Failed: <strong>{job.failed_items ?? 0}</strong></span>
            </div>
            {job.last_error && <p className="mt-2 text-xs text-destructive">{job.last_error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
