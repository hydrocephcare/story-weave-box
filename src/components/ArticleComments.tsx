import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { MessageCircle, Loader2, CornerDownRight, Reply } from "lucide-react";

interface Comment {
  id: string;
  author_name: string;
  body: string;
  created_at: string;
  parent_id?: string | null;
}

export default function ArticleComments({ articleId }: { articleId: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyName, setReplyName] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [replySubmitting, setReplySubmitting] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    const { data } = await supabase
      .from("article_comments")
      .select("id, author_name, body, created_at, parent_id")
      .eq("article_id", articleId)
      .order("created_at", { ascending: true })
      .limit(300);
    setComments((data as Comment[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    load();
  }, [articleId]);

  const { roots, repliesByParent } = useMemo(() => {
    const r: Comment[] = [];
    const map: Record<string, Comment[]> = {};
    for (const c of comments) {
      if (c.parent_id) (map[c.parent_id] ||= []).push(c);
      else r.push(c);
    }
    r.reverse();
    return { roots: r, repliesByParent: map };
  }, [comments]);

  const submitReply = async (parentId: string) => {
    const trimmed = replyBody.trim();
    if (!trimmed) return;
    setReplySubmitting(true);
    try {
      const { error } = await supabase.from("article_comments").insert({
        article_id: articleId,
        author_name: replyName.trim() || "Anonymous",
        body: trimmed.slice(0, 2000),
        parent_id: parentId,
      } as any);
      if (error) throw error;
      setReplyBody(""); setReplyName(""); setReplyTo(null);
      toast({ title: "Reply posted" });
      await load();
    } catch (err: any) {
      toast({ title: "Failed to reply", description: err.message, variant: "destructive" });
    } finally {
      setReplySubmitting(false);
    }
  };

  const renderComment = (c: Comment, isReply = false): JSX.Element => {
    const replies = repliesByParent[c.id] || [];
    return (
      <li key={c.id} className={isReply ? "" : "rounded-lg border border-border bg-background/50 p-3"}>
        <div className={isReply ? "rounded-lg bg-muted/40 p-3" : ""}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              {isReply && <CornerDownRight className="h-3 w-3 text-primary" />}
              {c.author_name}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </div>
          <p className="text-sm text-foreground/85 leading-relaxed whitespace-pre-wrap">{c.body}</p>
          <button
            type="button"
            onClick={() => { setReplyTo(replyTo === c.id ? null : c.id); setReplyBody(""); setReplyName(""); }}
            className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
          >
            <Reply className="h-3 w-3" />
            {replyTo === c.id ? "Cancel" : "Reply"}
          </button>
          {replyTo === c.id && (
            <div className="mt-2 space-y-2">
              <Input value={replyName} onChange={(e) => setReplyName(e.target.value)} placeholder="Your name (optional)" maxLength={60} className="text-sm" />
              <Textarea value={replyBody} onChange={(e) => setReplyBody(e.target.value)} placeholder={`Reply to ${c.author_name}…`} rows={2} maxLength={2000} className="text-sm" />
              <div className="flex justify-end">
                <Button size="sm" disabled={replySubmitting || !replyBody.trim()} onClick={() => submitReply(c.id)}>
                  {replySubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Post reply"}
                </Button>
              </div>
            </div>
          )}
        </div>
        {replies.length > 0 && (
          <ul className="mt-2 ml-4 space-y-2 border-l-2 border-primary/20 pl-3">
            {replies.map((r) => renderComment(r, true))}
          </ul>
        )}
      </li>
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("article_comments").insert({
        article_id: articleId,
        author_name: name.trim() || "Anonymous",
        body: trimmed.slice(0, 2000),
      } as any);
      if (error) throw error;
      setBody("");
      toast({ title: "Comment posted" });
      await load();
    } catch (err: any) {
      toast({ title: "Failed to post", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mt-12 rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <MessageCircle className="h-4 w-4 text-primary" />
        <h2 className="font-serif text-xl font-bold text-foreground">
          Comments {comments.length > 0 && <span className="text-sm font-normal text-muted-foreground">({comments.length})</span>}
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="mb-6 space-y-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name (optional)"
          maxLength={60}
          className="text-sm"
        />
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Share your thoughts or ask a question…"
          rows={3}
          maxLength={2000}
          required
          className="text-sm"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{body.length}/2000</span>
          <Button type="submit" size="sm" disabled={submitting || !body.trim()}>
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Post comment"}
          </Button>
        </div>
      </form>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : roots.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">Be the first to comment.</p>
      ) : (
        <ul className="space-y-3">
          {roots.map((c) => renderComment(c, false))}
        </ul>
      )}
    </section>
  );
}