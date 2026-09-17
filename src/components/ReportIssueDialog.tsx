import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ResourceType } from "@/lib/academic";

const REPORT_TYPES = [
  "Incorrect medical information",
  "Incorrect answer",
  "Broken image",
  "Missing section",
  "Formatting problem",
  "Wrong category",
  "Duplicate article",
  "Broken link",
  "Inappropriate contextual link",
  "Other",
];

const RATE_KEY = "reports:last";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  resourceType: ResourceType;
  resourceId: string;
  sectionAnchor?: string;
}

export default function ReportIssueDialog({ open, onOpenChange, resourceType, resourceId, sectionAnchor }: Props) {
  const { user } = useAuth();
  const [type, setType] = useState(REPORT_TYPES[0]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const last = Number(localStorage.getItem(RATE_KEY) || 0);
    if (Date.now() - last < 20000) {
      toast({ description: "Please wait a moment before sending another report.", variant: "destructive" });
      return;
    }
    setBusy(true);
    const selected = typeof window !== "undefined" ? String(window.getSelection() || "").slice(0, 400) : "";
    const { error } = await (supabase as unknown as { from: (t: string) => any }).from("content_reports").insert({
      user_id: user?.id ?? null,
      resource_type: resourceType,
      resource_id: resourceId,
      resource_url: typeof window !== "undefined" ? window.location.href : null,
      section_anchor: sectionAnchor ?? (typeof window !== "undefined" ? window.location.hash || null : null),
      selected_text: selected || null,
      report_type: type,
      message: message.slice(0, 2000) || null,
      device_info: typeof navigator !== "undefined" ? `${navigator.platform} · ${window.innerWidth}px` : null,
    });
    setBusy(false);
    if (error) {
      toast({ description: "Could not send the report. Please try again.", variant: "destructive" });
      return;
    }
    localStorage.setItem(RATE_KEY, String(Date.now()));
    setMessage("");
    onOpenChange(false);
    toast({ description: "Thank you — the report was sent for review." });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Report an issue</DialogTitle>
          <DialogDescription>Tell us what is wrong on this page so it can be corrected.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="report-type">Issue type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="report-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REPORT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report-message">Details (optional)</Label>
            <Textarea
              id="report-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="For example: Question 12 answer should be C, not B."
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Sending…" : "Send report"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
