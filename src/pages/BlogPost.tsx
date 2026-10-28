import { useState, useEffect, useMemo, useLayoutEffect, useRef, forwardRef, memo } from "react";
import { useReadLog } from "@/lib/readLog";
import { looksScanned, scanFirst, tidiedText } from "@/lib/blogFix";
import { applyPolish, getPolish, polishedIds, requestPolish, wantsPolish, type Polish } from "@/lib/blogPolish";
import AdSlot from "@/components/AdSlot";
import SideAds from "@/components/SideAds";
import { normaliseParenOptions } from "@/lib/parenOptions";
import { isPaperTitle, tileColors, usableImage } from "@/lib/blogImage";
import BooksForPage from "@/components/BooksForPage";
import { ArticleNav } from "@/components/NoteNavCards";
import NoteModeSwitch, { canCondense, condenseNote } from "@/components/NoteModeSwitch";
import ReadingBreak, { planBreaks, ProgressiveList } from "@/components/ReadingBreak";
import SponsorLine from "@/components/SponsorLine";
import StudyTools from "@/components/StudyTools";
import PageSummary from "@/components/PageSummary";
import OutlineLine from "@/components/OutlineLine";
import { yearOfCategory } from "@/hooks/useMyYear";
import HeroAurora from "@/components/HeroAurora";
import { mdToHtml } from "@/lib/miniMarkdown";
import ConnectedLearning from "@/components/ConnectedLearning";
import PharmacologyConnections from "@/components/PharmacologyConnections";
import drugIndex from "@/data/drugIndex.json";
import { findDrugIds, matchConditions } from "@/lib/noteLinks";
import { setNoteReturn } from "@/lib/noteReturn";
import SearchHighlightBar from "@/components/SearchHighlightBar";
import StudyPanel from "@/components/StudyPanel";
import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import {
  ArrowLeft, Check, Loader2, GraduationCap, ListChecks,
  ChevronDown, ChevronRight, FileText, HelpCircle, Sparkles, GitMerge, Settings2, ImagePlus, X, Eye, EyeOff, Lock,
} from "lucide-react";
import ShareButtons from "@/components/ShareButtons";
import ArticleComments from "@/components/ArticleComments";
import { Countdown, HtmlEmbed, VimeoEmbed, PasswordGate, ContentToc } from "@/components/ContentExtras";
import { motion, AnimatePresence } from "framer-motion";
import { getArticleBySlugOrId, getPublishedArticleSummaries, getRelatedContent, getCategoryDisplayName, getYearFromCategory, buildBlogPath, buildMcqPath, buildFlashcardPath, type Article } from "@/lib/store";
import { extractFirstImageFromContent, SITE_URL, stripRichText, readableSummary, updateMetaTags } from "@/lib/seo";
import { isGenericThumbnail, useTopicThumbnail, useTopicThumbnailInfo } from "@/lib/topicThumbnail";
import NoteTopics from "@/components/NoteTopics";
import { KeywordLinkProvider, useKeywordLinks, linkifyText } from "@/lib/keyword-link";
import { slugify, useHashFlash } from "@/lib/deep-link";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { saveNotePosition, trackNoteOpen } from "@/lib/readingTrail";
import { parseSlideDeck, SlideDeckView, SlidePreviewModal } from "@/components/SlideDeck";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useAccess } from "@/lib/access";
import { SubscribeModal } from "@/components/SubscribeModal";
import { openSubscribePrompt, useScrollSubscribePrompt } from "@/lib/subscribe-prompt";
import StudyControls from "@/components/StudyControls";
import HelpfulVote from "@/components/HelpfulVote";
import ArticleMcqOption from "@/components/ArticleMcqOption";
import {
  splitLeakedAnswer, cleanMetaTitle, cleanMetaDescription,
  articleHaystack, inferExamType, inferUnit,
  type PreviewMcq, type PreviewEssay, inferArticleLayout,
  cleanDisplayText, formatSequence, spaceOptionMarkers, countOptionMarkers,
  markerLetters, looksLikeChoiceRun, splitMarkerRun, normalizeOptionLine,
  splitOptionRun, splitStemAndOptions, isQuestionLike, extractExamQuestions,
  splitInlineTable, decodeEntities, dropEmptySections, cleanHeadingText,
  splitMalformedHeading, isTableRow, unwrapHardBreaks, preprocessContent,
  isLikelyStandaloneSectionHeading,
  isDuplicateArticleHeading,
  type TocItem, extractToc, answerKeyByQuestion, parseConsolidatedAnswerKey,
  mergeAnswerKeys, looksLikeUpcomingMcqOptions,
  groupQuestionSections,
} from "@/lib/blog-content";

/**
 * Mounts the subscription prompt for articles that carry MCQs: guests read the
 * questions freely and get nudged as they scroll; subscribers see nothing.
 */
function ArticleSubscribeGate({ hasMcqs }: { hasMcqs: boolean }) {
  const access = useAccess();
  useScrollSubscribePrompt(false);
  return <SubscribeModal settings={access.settings} loading={access.loading} onUnlocked={access.applyPass} />;
}

/* ─── Inline text: bold/italic ─── */
const Inline = forwardRef<HTMLSpanElement, { text: string }>(({ text }, ref) => {
  const linkCtx = useKeywordLinks();
  const parts = text.replace(/⭐+/g, "").split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return (
    <span ref={ref}>
      {parts.map((part, j) => {
        if (part.startsWith("**") && part.endsWith("**"))
          return <strong key={j} className="font-semibold text-foreground">{linkifyText(part.slice(2, -2), linkCtx, `s${j}`)}</strong>;
        if (part.startsWith("*") && part.endsWith("*") && part.length > 2)
          return <em key={j} className="text-foreground/80">{linkifyText(part.slice(1, -1), linkCtx, `e${j}`)}</em>;
        return <span key={j}>{linkifyText(part.replace(/\*/g, ""), linkCtx, `t${j}`)}</span>;
      })}
    </span>
  );
});
Inline.displayName = "Inline";

/* ─── Reading progress bar + dot ─── */
function ReadingProgress() {
  const [pct, setPct] = useState(0);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const fn = () => {
      const d = document.documentElement;
      const total = d.scrollHeight - d.clientHeight;
      setPct(total > 0 ? (d.scrollTop / total) * 100 : 0);
    };
    window.addEventListener("scroll", fn, { passive: true });
    fn();
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const rounded = Math.max(0, Math.min(100, Math.round(pct)));

  const getColor = (p: number) => {
    if (p < 25) return { bg: "bg-red-500", bar: "from-red-500 to-red-400" };
    if (p < 50) return { bg: "bg-orange-500", bar: "from-red-500 via-orange-500 to-orange-400" };
    if (p < 75) return { bg: "bg-yellow-500", bar: "from-red-500 via-orange-500 to-yellow-500" };
    return { bg: "bg-green-500", bar: "from-red-500 via-orange-500 via-yellow-500 to-green-500" };
  };
  const colors = getColor(rounded);

  return (
    <>
      <div className="fixed left-0 right-0 top-0 z-50 h-[3px]">
        <div className={`h-full bg-gradient-to-r ${colors.bar} transition-all duration-150`} style={{ width: `${pct}%` }} />
      </div>
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className={`fixed bottom-6 right-4 z-40 inline-flex items-center justify-center rounded-full border border-border text-white shadow-lg transition-all ${colors.bg} ${expanded ? "h-9 px-3 text-xs font-semibold" : "h-3.5 w-3.5"}`}
        aria-label="Reading progress"
      >
        <span className={`${expanded ? "opacity-100" : "sr-only"}`}>{rounded}%</span>
      </button>
    </>
  );
}

/* ─── Markdown table ─── */
function TableBlock({ lines }: { lines: string[] }) {
  const isSep = (l: string) => /^\|[\s\-:|]+(\|[\s\-:|]+)+\|?$/.test(l.trim());
  const parseRow = (l: string) =>
    l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim());
  const fallbackHeader = (index: number, total: number) => {
    if (total === 2) return index === 0 ? "Topic" : "Details";
    if (total === 3) return ["Topic", "Key point", "Clinical relevance"][index] || `Column ${index + 1}`;
    if (total === 4) return ["Topic", "Description", "Features", "Notes"][index] || `Column ${index + 1}`;
    return `Column ${index + 1}`;
  };
  const dataLines = lines.filter(l => !isSep(l));
  if (dataLines.length < 1) return null;
  const hasSeparator = lines.some(isSep);
  const [firstLine, ...restLines] = dataLines;
  const firstRow = parseRow(firstLine);
  const firstIsEmpty = firstRow.every((c) => !c || /^[\s-:]*$/.test(c));
  const useHeader = hasSeparator && !firstIsEmpty;
  const rows = (useHeader ? restLines : dataLines).map(parseRow).filter((row) => row.some(Boolean));
  const colCount = Math.max(firstRow.length, ...rows.map((r) => r.length));
  const headers = Array.from({ length: colCount }, (_, i) => (useHeader ? firstRow[i] : "") || fallbackHeader(i, colCount));
  if (!rows.length) return null;

  return (
    <div className="not-prose my-6 overflow-hidden border-y border-border bg-card sm:rounded-lg sm:border">
      <div className="overflow-x-auto">
      <table className="article-data-table min-w-full border-collapse text-sm"
style={{ minWidth: colCount <= 2 ? "min(420px, 100%)" : `${Math.max(560, colCount * 140)}px` }} data-columns={colCount}>
        <colgroup>
          {Array.from({ length: colCount }).map((_, i) => <col key={i} />)}
        </colgroup>
        <thead>
          <tr className="border-b border-border bg-muted/60">
            {Array.from({ length: colCount }).map((_, i) => (
              <th
                key={i}
                scope="col"
                className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-foreground"
              >
                <Inline text={headers[i] || ""} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-border/50 last:border-0 even:bg-muted/20">
              {Array.from({ length: colCount }).map((_, ci) => (
                <td
                  key={ci}
                  className="px-4 py-3 align-top leading-relaxed text-foreground/90"
                >
                  {row[ci] != null ? <Inline text={row[ci]} /> : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function FlowBlock({ lines }: { lines: string[] }) {
  const compact = lines.map((l) => l.trim()).filter(Boolean);
  if (!compact.length) return null;
  return (
    <div className="not-prose my-5 overflow-hidden rounded-lg border border-border bg-card">
      <div className="max-h-[70vh] overflow-x-auto px-4 py-4 sm:px-5">
        <div className="min-w-max space-y-2 text-center font-mono text-[13px] leading-6 text-foreground/90 sm:text-sm">
          {compact.map((line, i) => {
            const arrowOnly = /^(↓|v|\|)$/i.test(line);
            const branch = /\+[-+]+\+/.test(line) || /\s{2,}/.test(line);
            return (
              <div
                key={i}
                className={arrowOnly ? "text-primary" : branch ? "text-muted-foreground" : "rounded-md bg-muted/40 px-3 py-2"}
              >
                {arrowOnly ? "↓" : line}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── Practice Q expandable ─── */
function PracticeQuestion({ number, question, answer }: { number: string; question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  const access = useAccess();
  const locked = !access.canReveal;
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button onClick={() => locked ? openSubscribePrompt("Subscribe or restore your pass to reveal this answer.") : setOpen(o => !o)} className={`w-full flex items-start gap-3 px-4 py-4 sm:px-5 sm:py-4 text-left transition-colors ${locked ? "hover:bg-muted/30" : "hover:bg-muted/30"}`}>
        <span className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold mt-0.5">{number}</span>
        <span className="flex-1 text-sm sm:text-[15px] font-medium text-foreground leading-relaxed"><Inline text={question} /></span>
        {locked ? <Lock className="h-4 w-4 shrink-0 text-muted-foreground mt-1" /> : <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground mt-1 transition-transform ${open ? "rotate-180" : ""}`} />}
      </button>
      <AnimatePresence initial={false}>
        {open && !locked && (
          <motion.div key="a" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
            <div className="px-4 py-4 sm:px-5 sm:py-5 border-t border-border bg-muted/20">
              <p className="text-sm sm:text-[15px] text-foreground/90 leading-[1.75] whitespace-pre-line"><Inline text={answer} /></p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── MCQ answer + explanation collapsible (used inside articles) ─── */
/* Short-answer posts in the standard layout: "**N. question**" followed by "**Model answer:** …". Each question is a card and its answer sits
   behind the same reveal button as everywhere else, so a long paper reads as a clean list instead of one wall of text. */
type SaqItem = { n: string; stem: string; answer: string };
function parseSaq(content: string): { intro: string; items: SaqItem[] } | null {
  const items: SaqItem[] = [];
  const intro: string[] = [];
  let cur: SaqItem | null = null;
  for (const line of content.replace(/\r\n/g, "\n").split("\n")) {
    const m = line.match(/^\*\*(\d+)\.\s+(.+?)\*\*\s*$/);
    if (m) { cur = { n: m[1], stem: m[2].trim(), answer: "" }; items.push(cur); continue; }
    if (cur) cur.answer += `${line}\n`; else intro.push(line);
  }
  const label = /^\s*\*\*Model answer:\*\*\s*/i;
  const answered = items.filter((i) => label.test(i.answer.trim())).length;
  if (items.length < 3 || answered < 3) return null;
  for (const i of items) i.answer = i.answer.trim().replace(label, "").trim();
  return { intro: intro.join("\n").trim(), items };
}

function SaqCard({ item }: { item: SaqItem }) {
  const [open, setOpen] = useState(false);
  const access = useAccess();
  const locked = !access.canReveal;
  const html = useMemo(() => mdToHtml(item.answer, { skipTitle: true }), [item.answer]);
  return (
    <article className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 px-1 text-xs font-bold text-primary">{item.n}</span>
        <h3 className="flex-1 font-serif text-base font-bold leading-snug text-foreground sm:text-lg"><Inline text={item.stem} /></h3>
      </div>
      {item.answer && (
        <div className="mt-3">
          <button type="button" onClick={() => locked ? openSubscribePrompt("Subscribe or restore your pass to reveal this model answer.") : setOpen((v) => !v)} aria-expanded={!locked && open} className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/5 px-3 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400">
            {locked ? <Lock className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}{locked ? "Reveal (subscribers)" : open ? "Hide answer" : "Reveal answer"}
            {!locked && <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />}
          </button>
          {open && !locked && <div className="note-body mt-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-[15px] leading-7" dangerouslySetInnerHTML={{ __html: html }} />}
        </div>
      )}
    </article>
  );
}

/* Essay question — answers are always visible (never hidden behind a button) */
function EssayQuestion({ number, question, answer }: { number: string; question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  const access = useAccess();
  const locked = !access.canReveal;
  return (
    <article className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold mt-0.5">{number}</span>
        <h3 className="flex-1 text-sm sm:text-[15px] font-semibold text-foreground leading-relaxed"><Inline text={question} /></h3>
      </div>
      {answer && (
        <div className="mt-3">
          <button type="button" onClick={() => locked ? openSubscribePrompt("Subscribe or restore your pass to reveal this model answer.") : setOpen((value) => !value)} aria-expanded={!locked && open} className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/5 px-3 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400">
            {locked ? <Lock className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}{locked ? "Reveal (subscribers)" : open ? "Hide answer" : "Reveal answer"}
            {!locked && <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />}
          </button>
          {open && !locked && <div className="mt-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
            <p className="text-sm sm:text-[15px] text-foreground/90 leading-[1.75] whitespace-pre-line"><Inline text={answer} /></p>
          </div>}
        </div>
      )}
    </article>
  );
}


/** Paragraph renderer: strips OCR orphan punctuation and hides leaked answers. */
function renderProse(t: string, key: string) {
  const cleaned = t.replace(/^#+\s*/, "").replace(/^[.·•,;:]+\s*/, "").trim();
  if (!cleaned) return [];
  const { text, answer } = splitLeakedAnswer(cleaned);
  const out = [
    <p key={key} className="mb-5 text-[1.0625rem] leading-[1.7] text-foreground/85 sm:text-[1.3125rem]"><Inline text={text} /></p>,
  ];
  if (answer) out.push(<McqAnswerBlock key={`${key}-ans`} raw={answer} />);
  return out;
}

function McqAnswerBlock({ raw, articleId, questionKey }: { raw: string; articleId?: string; questionKey?: string }) {
  const [open, setOpen] = useState(false);
  const access = useAccess();
  const locked = !access.canReveal;
  useEffect(() => {
    if (!articleId || !questionKey || locked) return;
    const eventName = `ompath:answer:${articleId}:${questionKey}`;
    const reveal = (event: Event) => {
      const detail = (event as CustomEvent<{ solved?: boolean; firstAttempt?: boolean }>).detail;
      if (!detail?.solved) return;
      setOpen(true);
      if (!detail.firstAttempt) return;
      window.setTimeout(() => {
        const questions = Array.from(document.querySelectorAll<HTMLElement>('[data-article-question="true"]'));
        const currentIndex = questions.findIndex((question) => question.dataset.questionKey === questionKey);
        questions[currentIndex + 1]?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 220);
    };
    window.addEventListener(eventName, reveal);
    return () => window.removeEventListener(eventName, reveal);
  }, [articleId, questionKey, locked]);
  const normalized = raw
    .replace(/\*+/g, "")
    .replace(/^\s*✅?\s*(?:Answer|Model answer|Correct answer)\s*[:：]?\s*/i, "")
    .trim();
  const explanationAt = normalized.search(/(?:^|\n|\s)\s*(?:Explanation|Rationale)\s*[:：]/i);
  const answerRaw = explanationAt >= 0 ? normalized.slice(0, explanationAt) : normalized;
  const explanationRaw = explanationAt >= 0
    ? normalized.slice(explanationAt).replace(/^\s*(?:Explanation|Rationale)\s*[:：]\s*/i, "")
    : "";
  const answerLine = formatSequence(cleanDisplayText(answerRaw));
  const explanation = formatSequence(cleanDisplayText(explanationRaw));
  if (!answerLine && !explanation) return null;
  return (
    <div id={articleId && questionKey ? `answer-${articleId}-${questionKey}` : undefined} className="not-prose my-2">
      <button
        type="button"
        onClick={() => locked ? openSubscribePrompt("Subscribe or restore your pass to reveal this verified answer.") : setOpen((o) => !o)}
        aria-expanded={!locked && open}
        className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/5 px-3 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
      >
        {locked ? <Lock className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        {locked ? "Reveal (subscribers)" : open ? "Hide answer" : "Reveal answer"}
        {!locked && <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />}
      </button>
      <AnimatePresence initial={false}>
        {open && !locked && (
          <motion.div key="ans" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
            <div className="mt-2 space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
              <p className="text-[15px] font-semibold text-foreground">
                <span className="text-emerald-600 dark:text-emerald-400">Answer:</span>{" "}
                <Inline text={answerLine} />
              </p>
              {explanation && (
                <div className="text-[14px] leading-7 text-foreground/85 whitespace-pre-line">
                  <Inline text={explanation} />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function InlineAnswerBlock({ raw }: { raw: string }) {
  const [open, setOpen] = useState(false);
  const access = useAccess();
  const locked = !access.canReveal;
  const cleaned = raw
    .split("\n")
    .map((line) => cleanDisplayText(line.replace(/^✅\s*/, "").replace(/^(?:Answer|Model answer|Explanation|Correct answer)\s*[:：]\s*/i, "")))
    .filter(Boolean);
  if (!cleaned.length) return null;
  return (
    <div className="not-prose my-2">
      <button type="button" onClick={() => locked ? openSubscribePrompt("Subscribe or restore your pass to reveal this answer.") : setOpen((value) => !value)} aria-expanded={!locked && open} className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/5 px-3 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400">
        {locked ? <Lock className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}{locked ? "Reveal (subscribers)" : open ? "Hide answer" : "Reveal answer"}
        {!locked && <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />}
      </button>
      {open && !locked && <div className="mt-2 space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
        {cleaned.map((line, i) => (
          <p key={i} className="text-[1.0625rem] leading-[1.7] text-foreground/85 sm:text-[1.3125rem]"><Inline text={line} /></p>
        ))}
      </div>}
    </div>
  );
}

function RelatedArticleCard({ article, compact = false }: { article: any; compact?: boolean }) {
  // the page's own picture if it has a good one (never a scanned exam page); else the topic's picture from the free image library; else a coloured tile
  const own = usableImage(article);
  const paper = isPaperTitle(String(article.title ?? ""));
  const found = useTopicThumbnail(article.title ?? "", article.category, !own && !paper);
  const image = own || found || "";
  const [c1, c2] = tileColors(article);
  const summary = readableSummary(article.meta_description, article.content, compact ? 95 : 135);
  return (
    <Link
      to={buildBlogPath(article)}
      className={`${compact ? "w-[82vw] max-w-[340px] sm:w-80" : "w-full"} group grid shrink-0 snap-start overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-primary/40 sm:grid-cols-[132px_1fr]`}
    >
      <div className="aspect-[16/9] bg-muted sm:aspect-auto">
        {image ? (
          <img src={image} alt={article.title} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full min-h-24 flex-col justify-end p-3 text-white" style={{ backgroundImage: `linear-gradient(135deg, ${c1}, ${c2})` }}>
            <FileText className="h-6 w-6 opacity-80" aria-hidden />
            <span className="mt-1 line-clamp-2 text-[11px] font-bold uppercase tracking-wider opacity-80">{getCategoryDisplayName(article.category)}</span>
          </div>
        )}
      </div>
      <div className="min-w-0 p-3.5">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-primary">{getCategoryDisplayName(article.category)}</p>
        <h3 className="line-clamp-2 text-sm font-bold leading-snug text-foreground group-hover:text-primary">{article.title}</h3>
        {summary && <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{summary}</p>}
      </div>
    </Link>
  );
}

function InArticleRelated({ articles }: { articles: any[] }) {
  if (!articles.length) return null;
  return (
    <aside className="not-prose my-8 border-y border-border py-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Continue Reading</p>
        </div>
        <span className="text-[11px] text-muted-foreground">Swipe</span>
      </div>
      <div className="-mx-5 overflow-x-auto px-5 pb-1">
        <div className="flex snap-x snap-mandatory gap-3">
          {articles.slice(0, 8).map((a) => <RelatedArticleCard key={a.id} article={a} compact />)}
        </div>
      </div>
    </aside>
  );
}

/* ─── Classic magazine-style article hero ─── */
function ClassicHero(props: { imageHint?: string; minutes?: number; studyText?: string; studyPath?: string; articleId?: string; summaryId?: string; title: string; image: string; date: string; unit: string; shareUrl: string; description: string; category?: string; paperLine?: string; band?: boolean }) {
  return <ClassicHeroInner {...props} />;
}

/* ─── Closest-article fuzzy match for graceful redirects ─── */
const STOP = new Set(["the","a","an","and","or","of","to","in","for","with","on","at","by","from","is","are","be","as"]);
function tokenize(s: string): string[] {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
}
async function findClosestArticle(slugOrParam: string): Promise<{ id: string; title: string; path: string; score: number } | null> {
  try {
    const target = new Set(tokenize(decodeURIComponent(slugOrParam)));
    if (!target.size) return null;
    const list = await getPublishedArticleSummaries();
    let best: { id: string; title: string; path: string; score: number } | null = null;
    for (const row of list) {
      const tokens = new Set(tokenize(row.title));
      let inter = 0;
      target.forEach((t) => { if (tokens.has(t)) inter++; });
      const union = new Set([...target, ...tokens]).size || 1;
      const score = inter / union;
      if (!best || score > best.score) {
        best = { id: row.id, title: row.title, path: buildBlogPath(row), score };
      }
    }
    return best && best.score > 0 ? best : null;
  } catch {
    return null;
  }
}

/* ─── Classic hero: cinematic image with title + description overlaid ─── */
function ClassicHeroInner({
  title, image, imageHint, date, unit, shareUrl, description: rawDescription, category, summaryId, studyText, studyPath, articleId, minutes, paperLine, band,
}: { band?: boolean; paperLine?: string; imageHint?: string; minutes?: number; studyText?: string; studyPath?: string; articleId?: string; summaryId?: string; title: string; image: string; date: string; unit: string; shareUrl: string; description: string; category?: string }) {
  const specificImage = image && !isGenericThumbnail(image) ? image : "";
  const topicImage = useTopicThumbnailInfo(title, category, !specificImage, imageHint || null);
  const heroImage = paperLine ? "" : specificImage || topicImage?.url || ""; // a past paper is a working page: no stock picture, straight to the questions
  const reviewer = "";
  // a description that starts with "Summary" or stops in the middle of a word reads as unfinished: tidy it and end it at a sentence
  const description = paperLine || (() => {
    const t = String(rawDescription || "").replace(/^\s*summary\s*[:\-–—]?\s*/i, "").replace(/\s+/g, " ").trim();
    const cutAtSentence = (x: string) => { const e = Math.max(x.lastIndexOf(". "), x.lastIndexOf("; ")); return e > 60 ? x.slice(0, e + 1) : ""; };
    if (t.length <= 240) return /[.!?…]$/.test(t) || t.length < 60 ? t : cutAtSentence(t) || `${t.replace(/\s+\S{0,3}$/, "")}…`;
    const cut = t.slice(0, 240);
    return cutAtSentence(cut) || `${cut.replace(/\s+\S*$/, "")}…`;
  })();
  const year = yearOfCategory(category);

  return (
    <header className={band ? "relative isolate overflow-hidden border-b border-border/60" : "relative isolate -mx-4 mb-10 overflow-hidden border-b border-border/60 px-4 pb-8 pt-6 sm:mx-0 sm:rounded-3xl sm:border sm:px-10 sm:pb-12 sm:pt-12"}>
      <HeroAurora about={`${category ?? ""} ${title}`} />
      <div className={band ? "mx-auto grid max-w-[76rem] items-center gap-10 px-5 pb-8 pt-6 sm:px-6 sm:pb-10 sm:pt-8 md:grid-cols-[minmax(0,1fr)_22rem]" : ""}>
      <div className="min-w-0">
        {unit && <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">{unit}</p>}
        <h1 id={slugify(title)} className={paperLine ? "mt-2 scroll-mt-20 font-serif text-[1.6rem] font-bold leading-[1.15] tracking-tight text-foreground sm:text-[2.1rem]" : title.length > 55 ? "mt-2 scroll-mt-20 font-serif text-[1.85rem] font-bold leading-[1.1] tracking-tight text-foreground [overflow-wrap:anywhere] sm:text-4xl lg:text-[2.6rem]" : "mt-2 scroll-mt-20 font-serif text-[2.2rem] font-bold leading-[1.06] tracking-tight text-foreground [overflow-wrap:anywhere] sm:text-5xl lg:text-6xl"}>{title}</h1>
        {description && <p className={paperLine ? "mt-3 max-w-[68ch] text-[15px] font-medium text-foreground/70" : "mt-5 max-w-[68ch] text-xl leading-[1.65] text-foreground/85 sm:text-[1.4rem] sm:leading-[1.65]"}>{description}</p>}
        {summaryId && <PageSummary id={summaryId} className="mt-5" />}
        {studyText && studyText.length > 600 && studyPath && <StudyTools className="mt-5" title={title} path={studyPath} text={studyText} articleId={articleId} />}
        <OutlineLine title={title} year={yearOfCategory(category)} className="mt-4 max-w-[68ch]" />
        <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-foreground/75">
          <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-emerald-500" aria-hidden /> Updated {date}</span>
          {minutes ? <span>· {minutes} min read</span> : null}
          {year ? <span>· Year {year}</span> : null}
        </p>
        <ShareButtons url={shareUrl} title={title} description={description} variant="full" className="mt-5" />
      </div>
      {heroImage && (
        <figure className={band ? "md:mt-0" : "mt-6"}>
          <div className="overflow-hidden rounded-2xl border border-border bg-muted">
            <img src={heroImage} alt={title} loading="eager" decoding="async" className="h-44 w-full object-cover object-center sm:h-64 lg:h-72" />
          </div>
          {!specificImage && topicImage?.pageUrl && <figcaption className="mt-1.5 text-[11px] text-muted-foreground">Picture: {topicImage.credit}, {topicImage.license}</figcaption>}
        </figure>
      )}
      </div>
    </header>
  );
}

/* ─── Medically Reviewed badge (Cleveland-style) ─── */


function ReviewedBadge({ reviewer, date, onDark }: { reviewer: string; date: string; onDark?: boolean }) {
  const text = onDark ? "text-white/90" : "text-foreground";
  const sub = onDark ? "text-white/70" : "text-muted-foreground";
  return (
    <div className={`mt-5 flex items-start gap-2.5 text-sm ${text}`}>
      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
        <svg viewBox="0 0 20 20" className="h-3 w-3" fill="currentColor"><path d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 011.4-1.4l3.8 3.8 6.8-6.8a1 1 0 011.4 0z"/></svg>
      </span>
      <div className="leading-tight">
        <p className="font-semibold">Last updated {date}</p>
      </div>
    </div>
  );
}


function SourceAttribution({ article }: { article: any }) {
  const examType = inferExamType(article);
  const examYear = (article.exam_year || "").trim();
  const unit = inferUnit(article);
  const tags: string[] = Array.isArray(article.tags)
    ? article.tags.filter((tag: string) => !/\b(?:university|college|school|mku|uon|jkuat)\b/i.test(tag)).slice(0, 6)
    : [];
  const chips: { label: string; tone?: string }[] = [];
  if (examType) chips.push({ label: examYear ? `${examType} · ${examYear}` : examType, tone: "primary" });
  if (unit) chips.push({ label: unit });
  const hay = `${article?.title || ""}\n${article?.content || ""}\n${article?.meta_description || ""}`;
  const looksExamLike = /\b(MKU|Mount\s+Kenya\s+University|past\s*paper|CAT|MCQ|essay|question|exam|paper\s*\d)\b/i.test(hay);
  if (chips.length === 0 && tags.length === 0 && !looksExamLike) return null;
  return (
    <div className="mb-5">
      {chips.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {chips.map((c, i) => (
            <span
              key={i}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${c.tone === "primary" ? "bg-primary text-primary-foreground" : "bg-background border border-border text-foreground/80"}`}
            >
              {c.label}
            </span>
          ))}
        </div>
      )}
      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {tags.map((t) => (
            <span key={t} className="text-[10px] text-muted-foreground">#{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}



function ExamPreviewModal({ article, open, onClose }: { article: any; open: boolean; onClose: () => void }) {
  const data = useMemo(() => extractExamQuestions(article?.content || ""), [article?.content]);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open, onClose]);
  if (!open) return null;
  const title = decodeEntities(article?.title || "").replace(/^#+\s*/, "").trim();
  const examType = inferExamType(article);
  const examYear = (article?.exam_year || "").trim();
  const unit = inferUnit(article);
  const lecturer = (article?.lecturer || "").trim();

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-6 overflow-y-auto" onClick={onClose}>
      <div className="relative w-full max-w-3xl my-4 rounded-xl bg-white text-neutral-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="sticky top-2 float-right z-10 mr-2 mt-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-neutral-900 text-white shadow hover:bg-neutral-700"
          aria-label="Close preview"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="clear-both px-6 sm:px-10 py-8 sm:py-12 font-serif">
          {/* Cover */}
          <div className="mb-8 border-b-2 border-neutral-900 pb-6 text-center">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-neutral-800">Ompath Study</p>
            {unit && <p className="mt-1 text-xs uppercase tracking-widest text-neutral-500">Department of {unit}</p>}
            <h1 className="mt-4 text-2xl sm:text-3xl font-bold leading-tight">{title}</h1>
            <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-neutral-600">
              {examType && <span>{examType}{examYear ? ` · ${examYear}` : ""}</span>}
              {lecturer && <span>Lecturer: {lecturer}</span>}
              <span>Date: {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</span>
            </div>
            <p className="mt-4 text-[11px] italic text-neutral-500">Preview paper — questions only. Answers are hidden.</p>
          </div>

          {data.mcqs.length > 0 && (
            <section className="mb-10">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-[0.2em] text-neutral-700 border-b border-neutral-300 pb-2">Section A: Multiple Choice</h2>
              <ol className="space-y-6">
                {data.mcqs.map((q, index) => (
                  <li key={q.n} className="text-[15px] leading-relaxed">
                    <p className="font-semibold"><span className="mr-2">{index + 1}.</span>{cleanDisplayText(q.stem)}</p>
                    {q.opts.length > 0 && (
                      <ol className="mt-3 space-y-2 pl-0" type="A">
                        {q.opts.map((o, i) => (
                          <li key={i} className="flex items-start gap-2 text-[14px] text-neutral-800">
                            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-neutral-300 text-[11px] font-bold">{String.fromCharCode(65 + i)}</span>
                            <span>{cleanDisplayText(o.replace(/^\(?[A-Ea-e]\)?[.)]?\s*/, ""))}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {data.essays.length > 0 && (
            <section>
              <h2 className="mb-4 text-sm font-bold uppercase tracking-[0.2em] text-neutral-700 border-b border-neutral-300 pb-2">Section B: Essay Questions</h2>
              <ol className="space-y-5">
                {data.essays.map((q, index) => (
                  <li key={q.n} className="text-[15px] leading-relaxed">
                    <p><span className="mr-2 font-semibold">{index + 1}.</span>{cleanDisplayText(q.text)}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {data.mcqs.length === 0 && data.essays.length === 0 && (
            <p className="text-center text-sm text-neutral-500">No exam-style questions detected in this article.</p>
          )}

          <div className="mt-10 border-t border-neutral-300 pt-4 text-center text-[11px] text-neutral-500">
            Ompath Study · End of preview paper
          </div>
        </div>
      </div>
    </div>
  );
}

function ExamPreviewBall({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Preview exam paper"
      title="Preview exam paper"
      className="fixed top-[4.5rem] right-4 z-30 flex items-center gap-1.5 rounded-full border border-border bg-background/90 px-3 py-1.5 text-xs font-semibold text-foreground shadow-md backdrop-blur-md transition-colors hover:border-primary/40 hover:text-primary sm:right-6"
    >
      <ListChecks className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Preview</span>
    </button>
  );
}

/* ─── Article content renderer ─── */
let _sec = 0;

/** Content wrapped in [locked]…[/locked]: readable for subscribers, a clean unlock card for everyone else. */
function LockedSection({ lines }: { lines: string[] }) {
  const access = useAccess();
  const body = lines.map((l) => l.trim()).filter(Boolean);
  const placeholder = body.every((l) => /hidden until payment/i.test(l));
  if (access.canReveal && !placeholder) {
    return <div className="my-4 space-y-3">{body.map((l, k) => <p key={k} className="text-[1.0625rem] leading-[1.7] text-foreground/85 sm:text-[1.3125rem]"><Inline text={l} /></p>)}</div>;
  }
  if (access.canReveal) return null;
  return (
    <div className="not-prose my-6 rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Lock className="h-5 w-5" /></div>
      <p className="font-serif text-lg font-bold text-foreground">Subscriber-only section</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Model answers and marking points for this part are available to subscribers.</p>
      <Button size="sm" className="mt-4" onClick={() => openSubscribePrompt("Subscribe to read the full answers on this paper.")}>Unlock section</Button>
    </div>
  );
}

type ArticleContentProps = { content: string; articleId: string; category: string; title?: string; contentKind?: string };
/** Short-answer papers in the standard layout get question cards; everything else goes through the line-by-line renderer below. */
const ArticleContent = memo(function ArticleContent(props: ArticleContentProps) {
  const saq = useMemo(() => parseSaq(props.content), [props.content]);
  if (!saq) return <ArticleLines {...props} />;
  return (
    <>
      {saq.intro && <ArticleLines {...props} content={saq.intro} />}
      <div className="mt-6 space-y-4">{saq.items.map((item, k) => <SaqCard key={`${item.n}-${k}`} item={item} />)}</div>
    </>
  );
});
/** A search or highlight link needs the whole note on screen, so the parts are not used for it. */
const hasSearchTerm = () => typeof window !== "undefined" && /[?&](q|highlight|hl|at)=/.test(window.location.search);

const ArticleLines = memo(function ArticleLines({ content, articleId, category, title = "", contentKind = "" }: { content: string; articleId: string; category: string; title?: string; contentKind?: string }) {
  _sec = 0;
  const lines = groupQuestionSections(preprocessContent(normaliseParenOptions(content))).split("\n");
  // Explicit "Answer:" lines and bold-marked options win; a consolidated
  // "1 D, 2 C, …" key at the end of the document (common in handwritten CAT
  // scans) only fills in whatever neither of those could answer.
  const answerKeys = mergeAnswerKeys(answerKeyByQuestion(lines), parseConsolidatedAnswerKey(content));
  const els: React.ReactNode[] = [];
  let listBuf: { type: "ul" | "ol"; items: React.ReactNode[] } | null = null;
  let inPractice = false;
  let tableBuf: string[] = [];
  let flowBuf: string[] = [];
  let underSubheading = false;
  // Short-answer / SAQ papers have no multiple-choice options at all: their
  // A, B, C lines are answer points, so they must read as bullet points.
  const layoutKind = inferArticleLayout(title, contentKind, content);
  let examMode: "mcq" | "essay" | null =
    layoutKind === "essay" ? "essay" : layoutKind === "mcq" ? "mcq" : null;
  const pqs: { number: string; question: string; answer: string }[] = [];
  let currentQuestionKey = "";
  let currentQuestionText = "";
  let currentTopic = "";
  let displayQuestionNumber = 0;
  let keyCard = false;

  const flushList = () => {
    if (!listBuf) return;
    // the "Key points" list at the top of a note is shown as a highlighted card, so a student on a phone sees the essentials first
    // (only the one list right under the heading, with a rule down its side instead of a box; the flag used to stay on for the rest of the page, which boxed every list)
    els.push(<ul key={`list-${els.length}`} className={keyCard ? "mb-7 space-y-3 border-l-[3px] border-primary/50 pl-4" : "mb-7 space-y-3 pl-1"}>{listBuf.items}</ul>);
    keyCard = false;
    listBuf = null;
  };
  const flushTable = () => {
    if (tableBuf.length >= 2) els.push(<TableBlock key={`tbl-${els.length}`} lines={[...tableBuf]} />);
    tableBuf = [];
  };
  const flushFlow = () => {
    const meaningful = flowBuf.filter((l) => l.trim() && !/^(↓|v|\|)$/i.test(l.trim()));
    if (meaningful.length >= 2) els.push(<FlowBlock key={`flow-${els.length}`} lines={[...flowBuf]} />);
    else meaningful.forEach((l, idx) => els.push(<p key={`flow-p-${els.length}-${idx}`} className="mb-4 text-[1.0625rem] leading-[1.7] text-foreground/85 sm:text-[1.3125rem]"><Inline text={l} /></p>));
    flowBuf = [];
  };
  const flushPractice = () => {
    if (!pqs.length) return;
    els.push(
      <div key={`pq-${els.length}`} className="my-6">
        <div className="flex items-center gap-2 mb-3">
          <HelpCircle className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">Practice Questions</span>
        </div>
        <div className="space-y-2">{pqs.map((q, k) => <PracticeQuestion key={k} number={q.number} question={q.question} answer={q.answer} />)}</div>
      </div>
    );
    pqs.length = 0;
  };

  const pushBullet = (text: string, key: string) => {
    if (!listBuf || listBuf.type !== "ul") { flushList(); listBuf = { type: "ul", items: [] }; }
    listBuf.items.push(
      <li key={key} className="flex items-start gap-3.5 text-[1.0625rem] leading-[1.65] text-foreground/85 sm:text-[1.3125rem]">
        <span className="mt-[0.7em] h-2 w-2 rounded-full bg-primary shrink-0" />
        <span className="flex-1"><Inline text={text} /></span>
      </li>
    );
  };

  let codeBuf: string[] | null = null;
  let skipUntil = -1;
  // Unified MCQ layout: after a "Question N" header we render the stem as a
  // paragraph and label the first option group with "Choices".
  let pendingChoicesLabel = false;
  const choicesLabel = (key: string) => {
    if (!pendingChoicesLabel) return;
    pendingChoicesLabel = false;
    els.push(
      <p key={key} className="not-prose mt-4 mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Choices</p>
    );
  };
  for (let i = 0; i < lines.length; i++) {
    if (i < skipUntil) continue;
    const line = lines[i];
    let t = line.trim();
    // Imported multi-part banks retain source numbering (for example Q150).
    // Preserve that key internally, but display each page as a fresh 1..N set.
    if (/^#{1,6}\s+Q(?:uestion)?\s*\d+\s*[:.)-]/i.test(t)) {
      displayQuestionNumber += 1;
      t = t.replace(/^(#{1,6}\s+)Q(?:uestion)?\s*\d+/i, `$1Question ${displayQuestionNumber}`);
    }

    if (/^\[locked(?:\s[^\]]*)?\]/i.test(t)) {
      flushList(); flushTable(); flushFlow(); flushPractice(); underSubheading = false;
      const inner: string[] = [];
      const firstRest = t.replace(/^\[locked(?:\s[^\]]*)?\]/i, "").replace(/\[\/locked\]\s*$/i, "").trim();
      if (firstRest) inner.push(firstRest);
      let j = i + 1;
      if (!/\[\/locked\]\s*$/i.test(t)) {
        while (j < lines.length && !/\[\/locked\]/i.test(lines[j])) { inner.push(lines[j]); j++; }
        const tail = (lines[j] || "").replace(/\[\/locked\].*$/i, "").trim();
        if (tail) inner.push(tail);
        j++;
      }
      skipUntil = j;
      els.push(<LockedSection key={`locked-${i}`} lines={inner} />);
      continue;
    }
    if (/^\[\/locked\]$/i.test(t)) continue;

    if (/^```/.test(t)) {
      if (codeBuf == null) {
        flushList(); flushTable(); flushFlow(); flushPractice(); underSubheading = false;
        codeBuf = [];
      } else {
        const code = codeBuf.join("\n");
        els.push(<FlowBlock key={`code-flow-${i}`} lines={code.split("\n")} />);
        codeBuf = null;
      }
      continue;
    }
    if (codeBuf) { codeBuf.push(line); continue; }

    if (/^\*{0,2}\s*(✅\s*)?(?:Answer|Model answer|Correct answer|Explanation|Rationale)\s*[:：]/i.test(t)) {
      flushList(); flushFlow(); underSubheading = false;
      const buf: string[] = [t.replace(/^\*+/, "").replace(/\*+$/g, "")];
      let j = i + 1;
      let sawExp = false;
      while (j < lines.length) {
        const nt = lines[j].trim();
        // Strip leading markdown emphasis so "**Q2.**", "**MCQ 3**", "*Question 4*" all count.
        const ntStripped = nt.replace(/^[*_#>\s]+/, "");
        if (/^(MCQ|Question|Q)\s*\d+/i.test(ntStripped)) break;
        // Bold-wrapped question stems that end with **: "**Q2. text?**" / "**2. text?**"
        if (/^\*\*(?:Q(?:uestion)?\s*)?\d+[.)]/i.test(nt)) break;
        if (/^#{1,6}\s/.test(nt)) break;
        const isAnswerHdr = /^\*{0,2}\s*(✅\s*)?(?:Answer|Model answer|Correct answer)\s*[:：]/i.test(nt);
        const isExpHdr = /^\*{0,2}\s*(✅\s*)?(?:Explanation|Rationale)\s*[:：]/i.test(nt);
        // Merge a following Explanation/Rationale block into the SAME reveal button
        // so one question never renders two "Show answer & explanation" buttons.
        if (isAnswerHdr) break;
        if (isExpHdr && sawExp) break;
        if (/^\*{1,2}\d+\.\s/.test(nt)) break;
        if (/^\d+\.\s.{4,}[?:]\s*\*{0,2}$/.test(nt)) break;
        // Numbered question stems like "1. Something?" or "1) Something?"
        if (/^\d+[.)]\s+.{3,}[?:]\s*\*{0,2}$/.test(ntStripped)) break;
        // Standalone options like "A) foo" that start a new question's choice list
        if (/^[A-E][.)]\s+\S/.test(ntStripped) && sawExp) break;
        if (!nt) {
          if (sawExp) break;
          buf.push(lines[j]);
          j++;
          continue;
        }
        if (sawExp && /^-\s+[A-E][.)]\s/.test(nt)) break;
        buf.push(lines[j]);
        if (isExpHdr) sawExp = true;
        j++;
      }
      while (buf.length && !buf[buf.length - 1].trim()) buf.pop();
      pendingChoicesLabel = false;
      els.push(examMode === "essay"
        ? <InlineAnswerBlock key={`ans-${i}`} raw={buf.join("\n")} />
        : <McqAnswerBlock key={`mcq-${i}`} raw={buf.join("\n")} articleId={articleId} questionKey={currentQuestionKey} />
      );
      skipUntil = j;
      continue;
    }

    const flowLike = /^(↓|v|\+[-+]+\+|[-+|\s]{3,})$/i.test(t) || (/^[A-Za-z0-9()/,.''\-\s]+$/.test(t) && /^(STEP\s+\d+|[A-Z][A-Z\s-]{4,}|Compatible\s+Incompatible|AHR\s+FNHR|Packed\s+Platelet|Hypothermia\s+Dilutional)/.test(t));
    if (t.startsWith("|")) { flushList(); flushFlow(); tableBuf.push(t); underSubheading = false; continue; }
    else if (tableBuf.length) { flushTable(); }

    if (flowLike) { flushList(); flowBuf.push(t); underSubheading = false; continue; }
    else if (flowBuf.length) { flushFlow(); }

    if (!t) { flushList(); flushFlow(); underSubheading = false; continue; }

    // Source documents often include their own standalone "Choices:" line.
    // The renderer adds one compact label before option A, so suppress the
    // source copy to avoid duplicate headings and the large prose margins.
    if (/^\*{0,2}\s*Choices\s*:?\s*\*{0,2}$/i.test(t)) {
      flushList(); flushFlow(); underSubheading = false;
      continue;
    }

    if (t.startsWith("> ")) {
      flushList(); underSubheading = false;
      els.push(
        <blockquote key={`bq-${i}`} className="my-4 border-l-3 border-primary/40 pl-4 py-1">
          <p className="text-[15px] italic text-foreground/70 leading-relaxed"><Inline text={t.slice(2)} /></p>
        </blockquote>
      );
      continue;
    }

      const imageMatch = t.match(/^!\[(.*?)\]\((.*?)\)$/);
    if (imageMatch) {
      flushList();
      underSubheading = false;
      const alt = imageMatch[1]?.trim() || "Medical illustration";
      const src = imageMatch[2]?.trim();
        if (src) {
        els.push(
          <figure key={`img-${i}`} className="my-7 overflow-hidden rounded-lg border border-border bg-muted/20">
            <img src={src} alt={alt} loading="lazy" decoding="async" className="mx-auto max-h-[28rem] w-full object-contain" />
            {alt && <figcaption className="border-t border-border px-4 py-2 text-sm leading-relaxed text-muted-foreground">{alt}</figcaption>}
          </figure>
        );
      }
      continue;
    }

    const explicitQMatch = t.match(/^(QUESTION|Question|Q)\s*(\d+)[:\s-]*(.*)/i);
    // Some source papers number questions plainly ("### 3. …", "1. **…**")
    // instead of writing out "Question N" -- only treat that as a question
    // start when it's actually followed by MCQ-style options, so an ordinary
    // numbered heading/list item elsewhere on the site is never misread.
    const bareNumMatch = !explicitQMatch ? t.match(/^#{0,6}\s*\**\s*(\d+)[.)]\**\s+(.*)/) : null;
    const questionMatch: string[] | null =
      explicitQMatch || (bareNumMatch && looksLikeUpcomingMcqOptions(lines, i) ? [t, "Question", bareNumMatch[1], bareNumMatch[2]] : null);
    // ── Exam-paper front matter → compact meta card ──
    // "Programme: …", "Assessment: …", "Unit Code: …", "Date: …", "Reg No: …"
    const metaFieldRe = /^\*{0,2}\s*(Programme|Program|Course|Assessment|Exam|Paper|Unit Code|Unit|Subject|Date|Time|Duration|Venue|Marks|Instructions?|Reg\.?\s*No\.?|Registration\s*No\.?|Year|Semester|University|School)\s*\*{0,2}\s*[:：]\s*(.+)$/i;
    if (!questionMatch && metaFieldRe.test(t)) {
      const rows: { label: string; value: string }[] = [];
      let j = i;
      while (j < lines.length) {
        const lt = lines[j].trim();
        if (!lt) { j++; continue; }
        const m = lt.match(metaFieldRe);
        if (!m) break;
        rows.push({
          label: cleanDisplayText(m[1]).replace(/\s+/g, " ").trim(),
          value: cleanDisplayText(m[2].replace(/^\*+|\*+$/g, "")).trim(),
        });
        j++;
      }
      if (rows.length >= 2) {
        flushList(); flushTable(); flushFlow(); underSubheading = false;
        els.push(
          <dl
            key={`meta-card-${i}`}
            className="my-6 grid grid-cols-1 gap-x-6 gap-y-3 rounded-xl border border-primary/20 bg-primary/[0.04] p-5 sm:grid-cols-2"
          >
            {rows.map((r, n) => (
              <div key={`meta-row-${i}-${n}`} className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-primary/80">{r.label}</dt>
                <dd className="mt-0.5 text-[15px] font-medium leading-snug text-foreground break-words">
                  <Inline text={r.value} />
                </dd>
              </div>
            ))}
          </dl>
        );
        skipUntil = j;
        continue;
      }
    }
    if (questionMatch) {
      flushList(); flushPractice(); inPractice = false; underSubheading = false;
      _sec++;
      const sourceQNum = questionMatch[2];
      displayQuestionNumber += 1;
      const qNum = String(displayQuestionNumber);
      let qTitle = questionMatch[3]?.replace(/^\s*[-:]\s*/, "").trim() || "";
      // Drop the orphan punctuation OCR/imports leave after the number
      // ("Question 1 . 66-year-old man …").
      qTitle = qTitle.replace(/^[.·•,;:）)\-–—\s]+/, "").trim();
      // Unified layout across the whole site:
      //   "Question N"  →  stem paragraph  →  "Choices"  →  A–E rows  →  Reveal
      // A short ALL-CAPS topic glued onto the header ("Q9 — ABDOMINAL WALL i) …")
      // stays in the heading; everything after it becomes normal body text so it
      // never renders as a giant serif wall of prose.
      qTitle = cleanDisplayText(qTitle.replace(/^\*+|\*+$/g, ""));
      let topic = "";
      let stem = qTitle;
      const capsMatch = qTitle.match(/^([A-Z][A-Z0-9''/&,.\-\s]{2,58}?)\s+(?=(?:[ivx]+\)|\(?[a-z]\)|[A-Z][a-z]|[a-z]))/);
      if (capsMatch) {
        topic = capsMatch[1].replace(/[\s,.-]+$/, "").trim();
        stem = qTitle.slice(capsMatch[0].length).trim();
      } else if (/^[A-Z0-9''/&,.\-\s]{3,60}$/.test(qTitle)) {
        topic = qTitle.replace(/[\s,.-]+$/, "").trim();
        stem = "";
      }
      currentQuestionKey = sourceQNum;
      currentQuestionText = stem || qTitle;
      currentTopic = topic || category.replace(/^Year\s*\d+:\s*/i, "");
      els.push(
        <div key={`q-${i}`} id={`section-${_sec}`} data-article-question="true" data-question-key={qNum} className="not-prose mt-8 scroll-mt-24 border-t border-border pt-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-primary px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-primary-foreground">
              Question {qNum}
            </span>
            {topic && (
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{topic}</span>
            )}
          </div>
        </div>
      );
      if (stem) {
        const leaked = splitLeakedAnswer(stem);
        els.push(
          <p key={`q-stem-${i}`} className="mb-4 mt-3 text-[1.05rem] font-medium leading-[1.7] text-foreground">
            <Inline text={leaked.text} />
          </p>
        );
        if (leaked.answer) els.push(<McqAnswerBlock key={`q-stem-ans-${i}`} raw={leaked.answer} articleId={articleId} questionKey={currentQuestionKey} />);
      }
      pendingChoicesLabel = true;
      continue;
    }

    if (/^\*{0,2}\s*(?:Question\s*)?\d+[a-z]?[.)]\s+.{4,}/i.test(t) && examMode === "essay" && t.length <= 150) {
      flushList(); underSubheading = false;
      els.push(<p key={`essay-q-${i}`} className="mb-4 font-serif text-xl font-bold leading-snug text-foreground"><Inline text={cleanDisplayText(t)} /></p>);
      continue;
    }
    // A long numbered stem is prose, not a display heading — keep it readable.
    if (/^\*{0,2}\s*(?:Question\s*)?\d+[a-z]?[.)]\s+.{4,}/i.test(t) && examMode === "essay") {
      flushList(); underSubheading = false;
      els.push(<p key={`essay-q-long-${i}`} className="mb-4 text-[1.0625rem] leading-[1.7] text-foreground/85 sm:text-[1.3125rem]"><Inline text={cleanDisplayText(t)} /></p>);
      continue;
    }

    const combinedOpts = Array.from(t.matchAll(/(?:^|\s)([A-E])\s*[.)]\s*([\s\S]*?)(?=\s*[B-E]\s*[.)]\s*|$)/gi));
    if (combinedOpts.length >= 2 && !inPractice) {
      if (examMode !== "essay") { flushList(); }
      underSubheading = false;
      if (examMode !== "essay") choicesLabel(`choices-${i}`);
      else pendingChoicesLabel = false;
      combinedOpts.forEach((m, n) => {
        const label = m[1].toUpperCase();
        const rawOption = (m[2] || "").replace(/^\*+|\*+$/g, "").trim();
        const explanationMatch = rawOption.match(/^([\s\S]*?)\s*(?:Explanation|Rationale)\s*[:：]\s*([\s\S]+)$/i);
        const optText = (explanationMatch?.[1] || rawOption).trim();
        if (!optText) return;
        // In SAQ/essay papers the letters are answer points, not MCQ choices —
        // render them as a tight bulleted list so they read as revision points.
        if (examMode === "essay") {
          pushBullet(`**${label}.** ${optText}`, `essay-pt-${i}-${n}`);
          if (explanationMatch?.[2]) pushBullet(explanationMatch[2].trim(), `essay-pt-exp-${i}-${n}`);
          return;
        }
        els.push(<ArticleMcqOption key={`mcqopt-combo-${i}-${n}`} articleId={articleId} questionKey={currentQuestionKey || String(i)} questionText={currentQuestionText} category={category} topic={currentTopic} label={label} text={optText} correctLabel={answerKeys.get(currentQuestionKey)}><Inline text={optText} /></ArticleMcqOption>);
        if (explanationMatch?.[2]) {
          els.push(<McqAnswerBlock key={`mcqopt-combo-exp-${i}-${n}`} raw={`Answer: ${label}. ${optText}\nExplanation: ${explanationMatch[2]}`} articleId={articleId} questionKey={currentQuestionKey} />);
        }
      });
      continue;
    }

    const subQMatch = t.match(/^(\(?[a-z]\)|[ivx]+\)|\([ivx]+\))\s*(.+)/i);
    // MCQ choice line (A–E) — render uniformly even when wrapped in stray **
    // Handles: "A) text", "**A) text**", "E)** text", "**A.** text", etc.
    const mcqOptMatch = t.match(/^\*{0,2}\s*([A-E])\s*[.)]\s*\*{0,2}\s*(.+?)\s*\*{0,2}\s*$/);
    if (mcqOptMatch && !inPractice) {
      if (examMode !== "essay") { flushList(); }
      underSubheading = false;
      const label = mcqOptMatch[1].toUpperCase();
      const rawOption = mcqOptMatch[2].replace(/^\*+|\*+$/g, "").trim();
      const explanationMatch = rawOption.match(/^([\s\S]*?)\s*(?:Explanation|Rationale)\s*[:：]\s*([\s\S]+)$/i);
      const optText = (explanationMatch?.[1] || rawOption).trim();
      // A long lettered line is prose (an answer point), never an MCQ choice.
      // Parts of a written question ("(a) Explain ... (6 marks)") are sub-questions, not answer choices.
      const isSubQuestion = /\(\s*\d+\s*marks?\s*\)/i.test(optText) || /^(explain|describe|discuss|outline|list|define|state|give|compare|name|what|how|why|differentiate|enumerate|suspected|diagnostic)\b/i.test(optText);
      if (examMode === "essay" || optText.length > 110 || isSubQuestion) {
        pendingChoicesLabel = false;
        if (isSubQuestion) {
          const marks = /\(\s*(\d+)\s*marks?\s*\)/i.exec(optText)?.[1];
          const body = optText.replace(/\s*\(\s*\d+\s*marks?\s*\)\s*\.?\s*$/i, "").trim();
          els.push(
            <div key={`part-${i}`} className="not-prose my-1.5 flex items-baseline gap-3">
              <span className="w-5 shrink-0 text-[15px] font-bold text-primary">({label.toLowerCase()})</span>
              <p className="min-w-0 flex-1 text-base leading-7 text-foreground"><Inline text={body} /></p>
              {marks && <span className="shrink-0 text-xs font-semibold text-muted-foreground">[{marks} mark{marks === "1" ? "" : "s"}]</span>}
            </div>
          );
          if (explanationMatch?.[2]) pushBullet(explanationMatch[2].trim(), `essay-pt-exp-${i}`);
          continue;
        }
        pushBullet(`**${label}.** ${optText}`, `essay-pt-${i}`);
        if (explanationMatch?.[2]) pushBullet(explanationMatch[2].trim(), `essay-pt-exp-${i}`);
        continue;
      }
      if (label === "A") choicesLabel(`choices-${i}`);
      else pendingChoicesLabel = false;
      els.push(<ArticleMcqOption key={`mcqopt-${i}`} articleId={articleId} questionKey={currentQuestionKey || String(i)} questionText={currentQuestionText} category={category} topic={currentTopic} label={label} text={optText} correctLabel={answerKeys.get(currentQuestionKey)}><Inline text={optText} /></ArticleMcqOption>);
      if (explanationMatch?.[2]) {
        els.push(<McqAnswerBlock key={`mcqopt-exp-${i}`} raw={`Answer: ${label}. ${optText}\nExplanation: ${explanationMatch[2]}`} articleId={articleId} questionKey={currentQuestionKey} />);
      }
      continue;
    }
    if (subQMatch) {
      const label = subQMatch[1].replace(/[()]/g, "").toUpperCase();
      const rawSubText = subQMatch[2].trim();
      const marksMatch = rawSubText.match(/\s*(\[(?:\d+(?:\.\d+)?|½)\s*marks?\]|\((?:\d+(?:\.\d+)?|½)\s*marks?\))\s*$/i);
      const subText = marksMatch ? rawSubText.slice(0, marksMatch.index).trim() : rawSubText;
      // In SAQ/essay papers "(a) …" lines are answer points: bullet them so the
      // page reads as revision points instead of a wall of chipped rows.
      flushList(); underSubheading = false;
      els.push(
        <div key={`subq-${i}`} className="not-prose my-1.5 grid grid-cols-[2rem_minmax(0,1fr)] items-baseline gap-x-3 sm:grid-cols-[2rem_minmax(0,1fr)_auto]">
          <span className="text-[15px] font-bold text-primary">({String(label).toLowerCase()})</span>
          <p className="min-w-0 pt-1 text-[15px] font-medium leading-relaxed text-foreground"><Inline text={subText} /></p>
          {marksMatch && <span className="col-start-2 mt-1 whitespace-nowrap text-xs font-semibold text-muted-foreground sm:col-start-3 sm:row-start-1 sm:mt-1.5">{marksMatch[1]}</span>}
        </div>
      );
      continue;
    }

    if (/^#{1,2}\s/.test(t)) {
      flushList(); underSubheading = false;
      const heading = t.replace(/^#+\s+/, "").replace(/\*+/g, "").replace(/⭐+/g, "").replace(/^\d+\.\s*/, "").replace(/^[IVXLC]+\.\s+/, "").trim();
      if (i < 12 && isDuplicateArticleHeading(heading, title)) continue;
      if (/\b(section\s+a|multiple\s+choice|mcqs?)\b/i.test(heading)) examMode = "mcq";
      if (/\b(section\s+b|section\s+c|essay|short\s+answer|long\s+answer|answer\s+any)\b/i.test(heading)) examMode = "essay";
      if (heading.toLowerCase().includes("practice")) { inPractice = true; continue; }
      flushPractice(); inPractice = false;
      keyCard = /^(key\s+points?|at\s+a\s+glance|summary|learning\s+objectives?|high[- ]yield)\b/i.test(heading);
      _sec++;
      els.push(
        <h2 key={`h2-${i}`} id={slugify(heading) || `section-${_sec}`} data-section={`section-${_sec}`} className="mt-14 mb-5 scroll-mt-24 font-serif text-[1.85rem] font-bold leading-[1.15] tracking-tight text-foreground sm:mt-20 sm:text-[2.35rem]">
          {heading}
        </h2>
      );
      continue;
    }

    if (/^#{3,6}\s/.test(t)) {
      flushList(); underSubheading = true;
      const split = splitMalformedHeading(t.replace(/^#+\s+/, ""));
      const txt = split.heading;
      if (txt) els.push(<h3 key={`h3-${i}`} id={slugify(txt)} className="mt-10 mb-3 scroll-mt-24 font-serif text-[1.35rem] font-bold leading-snug text-foreground sm:text-[1.6rem]">{txt}</h3>);
      split.extras.forEach((extra, extraIndex) => els.push(...renderProse(extra, `h3-extra-${i}-${extraIndex}`)));
      continue;
    }

    const qa = t.match(/^(\d+)\.\s(.+?)\s*→\s*(.+)$/);
    if (qa) {
      flushList(); underSubheading = false;
      if (inPractice) pqs.push({ number: qa[1], question: qa[2], answer: qa[3] });
      else els.push(
        <div key={`qa-${i}`} className="mb-4 border-l-[3px] border-border pl-4">
          <p className="text-sm font-medium text-foreground">{qa[1]}. <Inline text={qa[2]} /></p>
          <p className="mt-1.5 text-sm text-primary font-medium">→ <Inline text={qa[3]} /></p>
        </div>
      );
      continue;
    }

    if (inPractice && /^\d+\.\s/.test(t) && !t.includes("→")) {
      const next = lines[i + 1]?.trim() ?? "";
      pqs.push({ number: t.match(/^(\d+)/)?.[1] ?? "", question: t.replace(/^\d+\.\s/, ""), answer: next.startsWith("→") ? next.slice(1).trim() : "" });
      continue;
    }
    if (inPractice && t.startsWith("→")) continue;

    // "- ", "* " and "• " all start a bullet (the AI writer used "* "); a line of only stars or dashes is a divider, not a bullet
    const bulletAt = /^[-*•]\s+(\S.*)$/.exec(t);
    if (bulletAt && !/^[-*•\s]+$/.test(t)) { pushBullet(bulletAt[1], `li-${i}`); continue; }

    if (/^\d+(?:\.\d+)?$/.test(t)) continue;

    if (/^\d+\.\s/.test(t) && !t.includes("→") && !inPractice) {
      const num = t.match(/^(\d+)/)?.[1] ?? "";
      const stepText = t.replace(/^\d+\.\s/, "").replace(/\*+/g, "").trim();
      if (stepText.length <= 48 && !/[.:;!?]$/.test(stepText)) {
        flushList(); underSubheading = false;
        els.push(<h4 key={`step-${i}`} className="mb-3 mt-10 flex items-center gap-3 font-serif text-[1.35rem] font-bold leading-snug text-foreground sm:text-[1.6rem]"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 font-sans text-sm font-bold text-primary">{num}</span>{stepText}</h4>);
        continue;
      }
      if (!listBuf || listBuf.type !== "ol") { flushList(); listBuf = { type: "ol", items: [] }; }
      listBuf.items.push(
        <li key={`ol-${i}`} className="flex items-start gap-3.5 text-[1.0625rem] leading-[1.65] text-foreground/85 sm:text-[1.3125rem]">
          <span className="mt-[0.35em] flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">{num}</span>
          <span className="flex-1"><Inline text={t.replace(/^\d+\.\s/, "")} /></span>
        </li>
      );
      continue;
    }

    const boldLabelMatch = t.match(/^\*\*([^*]+)\*\*:?$/);
    if (boldLabelMatch) {
      flushList();
      const blText = boldLabelMatch[1].replace(/:$/, "").trim();
      els.push(<h3 key={`bl-${i}`} id={slugify(blText)} className="mt-6 mb-2 scroll-mt-20 font-semibold text-base text-foreground">{blText}</h3>);
      underSubheading = false;
      continue;
    }

    if (isLikelyStandaloneSectionHeading(t, i > 0 ? lines[i - 1] : "", i + 1 < lines.length ? lines[i + 1] : "")) {
      flushList(); underSubheading = false;
      const sectionTitle = cleanDisplayText(t).replace(/^\*+|\*+$/g, "").trim();
      els.push(<h3 key={`plain-heading-${i}`} id={slugify(sectionTitle)} className="mt-9 mb-3 scroll-mt-20 font-serif text-xl font-bold leading-snug text-foreground">{sectionTitle}</h3>);
      continue;
    }

    const isSubLabel = /^[A-Za-z*\s()–-]{2,60}:$/.test(t);
    if (isSubLabel) {
      flushList();
      const slText = t.slice(0, -1).replace(/\*+/g, "").trim();
      els.push(<h3 key={`sl-${i}`} id={slugify(slText)} className="mt-6 mb-2 scroll-mt-20 font-semibold text-lg text-foreground"><Inline text={t.slice(0, -1)} /></h3>);
      underSubheading = false;
      continue;
    }

    if (underSubheading) {
      if (t.startsWith("⚠️") || t.startsWith("⚠")) {
        flushList();
        els.push(
          <div key={`warn-${i}`} className="my-3 flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2.5">
            <span className="text-amber-500 text-sm shrink-0">⚠️</span>
            <p className="text-sm leading-relaxed text-foreground/85"><Inline text={t.replace(/^⚠️?\s*/, "")} /></p>
          </div>
        );
        continue;
      }
      underSubheading = false;
      els.push(...renderProse(t, `p-sub-${i}`));
      continue;
    }

    flushList(); underSubheading = false;

    if (t.startsWith("⚠️") || t.startsWith("⚠")) {
      els.push(
        <div key={`wp-${i}`} className="my-3 flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2.5">
          <span className="text-amber-500 text-sm shrink-0">⚠️</span>
          <p className="text-sm leading-relaxed text-foreground/85"><Inline text={t.replace(/^⚠️?\s*/, "")} /></p>
        </div>
      );
      continue;
    }

    els.push(...renderProse(t, `p-${i}`));
  }

  if (codeBuf && codeBuf.length) {
    els.push(<FlowBlock key="code-tail-flow" lines={codeBuf} />);
  }

  flushList(); flushTable(); flushFlow(); flushPractice();
  // pictures that follow each other sit side by side (a swipeable strip on a phone) instead of one huge picture under another
  {
    const keyOf0 = (el: React.ReactNode) => String((el as { key?: string | null })?.key ?? "");
    const grouped: React.ReactNode[] = []; let run: React.ReactNode[] = [];
    const flushRun = () => { if (run.length > 1) grouped.push(<div key={`figrow-${keyOf0(run[0])}`} className={`fig-row fig-${Math.min(run.length, 4)}`}>{run}</div>); else grouped.push(...run); run = []; };
    for (const el of els) { if (keyOf0(el).startsWith("img-")) run.push(el); else { flushRun(); grouped.push(el); } }
    flushRun();
    els.length = 0; els.push(...grouped);
  }
  // Plain study notes get a short pause or two between paragraphs (a quick check, flashcards, a related note or a book). Never on papers, question banks or exams.
  // a note of more than about 9,000 characters is read one part at a time
  const longNote = els.length >= 36 && lines.join(" ").length > 9000;
  const isStudyNote = !examMode && !/\b(mcqs?|questions?|exam|papers?|quiz|saq|osce|answers?)\b/i.test(`${title} ${contentKind}`) && !/\*\*Answer:\*\*/.test(lines.join("\n").slice(0, 60000));
  if (isStudyNote && articleId) {
    const plan = planBreaks(articleId, els.length, true);
    if (plan.length) {
      const readText = lines.join(" ");
      const out: React.ReactNode[] = [];
      const todo = plan.map((b) => ({ ...b }));
      const keyOf = (el: React.ReactNode) => String((el as { key?: string | null })?.key ?? "");
      const isHeading = (k: string) => /^(h2|h3|plain-heading|bl|sl)-/.test(k);
      let lastWasPause = false;
      els.forEach((el, idx) => {
        const next = todo[0];
        // a pause goes in front of a new section (never in the middle of a list), or, failing that, between two plain paragraphs
        if (next && idx >= next.at && !lastWasPause && (isHeading(keyOf(el)) || (idx >= next.at + 6 && /^p-/.test(keyOf(el)) && /^p-/.test(keyOf(els[idx - 1]))))) {
          todo.shift();
          const upto = Math.round(lines.length * (idx / els.length));
          out.push(<ReadingBreak key={`pause-${idx}`} kind={next.kind} articleId={articleId} category={category} title={title} readText={lines.slice(Math.max(0, upto - 60), upto).join(" ") || readText.slice(0, 1800)} />);
          lastWasPause = true;
        } else lastWasPause = false;
        out.push(el);
      });
      return <ProgressiveList items={out} />; // the whole article on one page, never split into "parts"
    }
  }
  return <ProgressiveList items={els} />;
});

/* ─── Question jump grid for question banks without headings ─── */
function QuestionIndex() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setCount(document.querySelectorAll('[data-article-question="true"]').length), 400);
    return () => clearTimeout(t);
  }, []);
  if (!count) return null;
  return (
    <nav className="rounded-xl border border-border bg-card p-3" aria-label="Jump to question">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Questions ({count})</p>
      <div className="grid grid-cols-5 gap-1.5">
        {Array.from({ length: count }).map((_, k) => (
          <button key={k} type="button" onClick={() => document.querySelectorAll('[data-article-question="true"]')[k]?.scrollIntoView({ behavior: "smooth", block: "start" })} className="rounded-md border border-border bg-background py-1 text-xs font-semibold text-foreground hover:border-primary hover:text-primary">{k + 1}</button>
        ))}
      </div>
    </nav>
  );
}

/* ─── Sidebar TOC ─── */
function SidebarToc({ items, activeId }: { items: TocItem[]; activeId: string }) {
  if (items.length < 1) return null;
  return (
    <nav className="space-y-0.5">
      <p className="mb-3 pl-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">On this page</p>
      {items.map(item => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className={`block text-[15px] leading-snug py-1.5 pl-4 border-l-2 transition-colors ${
            activeId === item.id
              ? "border-primary text-primary font-medium"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
          }`}
        >
          {item.text}
        </a>
      ))}
    </nav>
  );
}

/* ─── Main BlogPost component ─── */
export default function BlogPost() {
  const { slug } = useParams();
  const [quickView, setQuickView] = useState(false);
  useEffect(() => { setQuickView(false); }, [slug]);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { isAdmin, user } = useAuth();
  useHashFlash();

  const [article, setArticle] = useState<Article | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isOffline, setIsOffline] = useState(typeof navigator !== "undefined" ? !navigator.onLine : false);
  const [suggestion, setSuggestion] = useState<{ id: string; title: string; path: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [related, setRelated] = useState<{ articles: any[]; flashcards: any[]; mcqs: any[]; essays: any[] }>({ articles: [], flashcards: [], mcqs: [], essays: [] });
  const [activeSection, setActiveSection] = useState("");
  // long notes are shown in slices; the contents list is watched again once the last slice is in
  const [noteReady, setNoteReady] = useState(0);
  useEffect(() => { const f = () => setNoteReady((n) => n + 1); window.addEventListener("ompath:note-ready", f); return () => window.removeEventListener("ompath:note-ready", f); }, []);
  const [previewOpen, setPreviewOpen] = useState(false);
  useReadLog(article?.title);
  const [polishNote, setPolishNote] = useState(""); // shown while the AI is making the page cleaner

  // A paper that was only scanned: the page pictures are stored apart from the text (they are heavy), so they are fetched now and shown instead of reading noise.
  const scanId = article && looksScanned(article) && !String((article as { original_notes?: string }).original_notes ?? "").includes("![") ? article.id : null;
  useEffect(() => {
    if (!scanId) return;
    let on = true;
    void (async () => {
      const { data } = await supabase.from("articles").select("original_notes").eq("id", scanId).maybeSingle();
      const notes = String(data?.original_notes ?? "");
      if (on && notes.includes("![")) setArticle((cur) => (cur && cur.id === scanId ? scanFirst({ ...cur, original_notes: notes }) : cur));
    })();
    return () => { on = false; };
  }, [scanId]);

  const handleBack = () => {
    const fromPath = (location.state as { from?: string } | null)?.from;
    if (fromPath && fromPath.startsWith("/blog")) {
      navigate(fromPath);
      return;
    }

    const savedYear = sessionStorage.getItem("nav_year_filter");
    if (savedYear && /^Year [1-6]$/.test(savedYear)) navigate(`/blog?year=${encodeURIComponent(savedYear)}`);
    else navigate("/blog");
  };

  // The reading trail: remember this note (here and in the account), keep track of how far down the reader is, and honour "resume where I was" links (?at=0.42).
  const trailUserId = user?.id ?? null;
  useEffect(() => {
    if (!article?.id) return;
    const id = article.id;
    void trackNoteOpen(trailUserId, { id, title: article.title, category: article.category || "" });
    let last = 0, timer = 0, sec = 0, lastTouch = Date.now(), tick = 0;
    const words = String(article.content || "").split(/\s+/).length;
    // a proper read takes about a third of the note's reading time at least (never less than 40 seconds, never more than 8 minutes)
    const needSec = Math.max(40, Math.min(480, Math.round((words / 230) * 60 * 0.33)));
    const touch = () => { lastTouch = Date.now(); };
    const fraction = () => { const max = document.documentElement.scrollHeight - window.innerHeight; return max > 400 ? window.scrollY / max : 0; };
    const save = () => {
      const f = fraction();
      if (Math.abs(f - last) >= 0.03 || f >= 0.9) {
        last = f;
        void saveNotePosition(trailUserId, id, f, sec, needSec).then((became) => { if (became) { window.dispatchEvent(new CustomEvent("ompath:note-read", { detail: { id, title: article.title } })); } });
      }
    };
    const onScroll = () => { touch(); window.clearTimeout(timer); timer = window.setTimeout(save, 2500); };
    // seconds of real attention: the tab is open and the reader moved, touched or typed in the last 25 seconds
    tick = window.setInterval(() => { if (document.visibilityState === "visible" && Date.now() - lastTouch < 25000) { sec += 1; if (sec % 20 === 0) save(); } }, 1000);
    window.addEventListener("touchstart", touch, { passive: true }); window.addEventListener("pointerdown", touch, { passive: true }); window.addEventListener("keydown", touch);
    const onHide = () => { if (document.visibilityState === "hidden") save(); };
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", save);
    const at = Number(new URLSearchParams(location.search).get("at"));
    let go = 0, done = false;
    const resume = () => {
      if (done || !(at > 0.02 && at <= 1)) return;
      done = true;
      window.setTimeout(() => { const max = document.documentElement.scrollHeight - window.innerHeight; window.scrollTo({ top: max * at, behavior: "auto" }); last = at; }, 150);
    };
    if (at > 0.02) { window.addEventListener("ompath:note-ready", resume, { once: true }); go = window.setTimeout(resume, 2500); }
    return () => { save(); window.clearTimeout(timer); window.clearInterval(tick); window.removeEventListener("touchstart", touch); window.removeEventListener("pointerdown", touch); window.removeEventListener("keydown", touch); window.clearTimeout(go); window.removeEventListener("scroll", onScroll); document.removeEventListener("visibilitychange", onHide); window.removeEventListener("pagehide", save); window.removeEventListener("ompath:note-ready", resume); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article?.id, trailUserId]);

  useLayoutEffect(() => {
    let isReload = false;
    try {
      const navEntry = (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined);
      isReload = navEntry?.type === "reload";
    } catch { /* ignore */ }
    if (isReload && slug) {
      const saved = parseInt(sessionStorage.getItem(`blog_scroll_${slug}`) || "0", 10);
      if (saved > 0) {
        const restore = () => window.scrollTo({ top: saved, left: 0, behavior: "auto" });
        const r1 = requestAnimationFrame(() => { restore(); requestAnimationFrame(restore); });
        const t1 = window.setTimeout(restore, 120);
        const t2 = window.setTimeout(restore, 350);
        const t3 = window.setTimeout(restore, 800);
        return () => { cancelAnimationFrame(r1); clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
      }
    }

    // New-route and back/forward scroll are handled centrally by ScrollToTop.
  }, [slug, location.key, article?.id]);

  useEffect(() => {
    if (!slug) return;
    const key = `blog_scroll_${slug}`;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        sessionStorage.setItem(key, String(window.scrollY));
        raf = 0;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [slug]);

  const reloadCurrentArticle = async (id: string) => {
    const refreshed = await getArticleBySlugOrId(id);
    if (refreshed) {
      setArticle(scanFirst(refreshed));
      if (refreshed.category) setRelated(await getRelatedContent(refreshed.category, refreshed.id));
    }
  };

  // Tidy with AI: the paper doctor works through the page one section at a time (so the screen never freezes on a long page), shows which section it is on,
  // and files its proposal in "Written papers" to compare and approve. Nothing on the live page changes until then.
  const [aiNote, setAiNote] = useState("");
  const runTidy = async () => {
    if (!article) return;
    setActionLoading("format");
    try {
      let status = "working";
      for (let n = 0; n < 20 && status === "working"; n++) {
        setAiNote(n === 0 ? "Reading the page…" : `Tidying section ${n + 1}…`);
        const { data, error } = await supabase.functions.invoke("paper-doctor", { body: { article_id: article.id, force: n === 0 } });
        if (error) throw new Error(error.message);
        if (data?.error) throw new Error(data.error);
        status = String(data?.status || "");
        if (status === "working" && data?.of) setAiNote(`Tidied section ${data.section} of ${data.of}…`);
      }
      if (status === "pending") {
        toast({ title: "A tidy version is ready", description: "Opening it so you can compare before it goes live." });
        navigate(`/admin/paper-fixes?open=${article.id}`);
      } else if (status === "clean") toast({ title: "Nothing to change", description: "The AI found this page already tidy." });
      else throw new Error("The AI could not finish this page. Try again in a minute.");
    } catch (err: any) {
      toast({ title: "Tidy failed", description: err?.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
      setAiNote("");
    }
  };

  const runGeminiUpgrade = async (type: "format" | "expand") => {
    if (!article) return;
    setActionLoading(type);
    try {
      const { data, error } = await supabase.functions.invoke("content-upgrade", { body: { action: "upgrade", id: article.id, type } });
      if (error) throw new Error(error.message);
      if (!data?.improved_content) throw new Error("No upgraded content returned");
      // a reply shorter than the page means the AI was cut off or dropped text: never replace the page with it
      if (String(data.improved_content).length < article.content.length * 0.9) throw new Error("The AI's answer was shorter than the page, so it was not applied. Nothing changed.");
      // keep the old text so this can be put back from Written papers
      await (supabase as any).from("paper_fixes").upsert({ article_id: article.id, status: "approved", old_title: article.title, new_title: article.title, old_content: article.content, new_content: data.improved_content, first_content: article.content, issues: [type === "expand" ? "Expanded with Gemini" : "Reformatted with Gemini"], pass: 2, decided_at: new Date().toISOString() }, { onConflict: "article_id" });
      const { error: applyError } = await supabase.functions.invoke("content-upgrade", {
        body: { action: "apply", id: article.id, content: data.improved_content, title: article.title },
      });
      if (applyError) throw new Error(applyError.message);
      await reloadCurrentArticle(article.id);
      toast({ title: type === "format" ? "Formatting applied" : "Content expanded" });
    } catch (err: any) {
      toast({ title: "Action failed", description: err?.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const runGenerateSaqs = async () => {
    if (!article) return;
    setActionLoading("saq");
    try {
      const { data, error } = await supabase.functions.invoke("generate-content", {
        body: { notes: article.content, type: "essay-qa" },
      });
      if (error) throw new Error(error.message);

      const saqs = Array.isArray(data?.saqs) ? data.saqs : [];
      if (!saqs.length) throw new Error("No SAQs generated");

      const section = [
        "",
        "## Short Answer Questions",
        ...saqs.map((q: any, i: number) => `### SAQ ${i + 1}\n${q.question}\n\n**Model answer:** ${q.answer || q.model_answer || ""}`),
      ].join("\n\n");

      const { error: applyError } = await supabase.functions.invoke("content-upgrade", {
        body: { action: "apply", id: article.id, title: article.title, content: `${article.content}\n${section}` },
      });
      if (applyError) throw new Error(applyError.message);

      await reloadCurrentArticle(article.id);
      toast({ title: "SAQs added to the end of this article" });
    } catch (err: any) {
      toast({ title: "Action failed", description: err?.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const runGenerateCoverImage = async () => {
    if (!article) return;
    setActionLoading("image");
    try {
      const { data, error } = await supabase.functions.invoke("content-upgrade", {
        body: { action: "generate_image", id: article.id },
      });
      if (error) throw new Error(error.message);
      const imageDataUrl = data?.image_data_url as string | undefined;
      if (!imageDataUrl) throw new Error("No image returned");

      const contentWithoutTopImage = article.content.replace(/^!\[[^\]]*\]\([^)]+\)\s*\n*/m, "").trimStart();
      const imageAlt = article.title.replace(/\s+/g, " ").trim() || "Medical illustration";
      const newContent = `

![${imageAlt}](${imageDataUrl})

\n\n${contentWithoutTopImage}`;

      const { error: applyError } = await supabase.functions.invoke("content-upgrade", {
        body: { action: "apply", id: article.id, title: article.title, content: newContent },
      });
      if (applyError) throw new Error(applyError.message);

      await reloadCurrentArticle(article.id);
      toast({ title: "Gemini cover image generated" });
    } catch (err: any) {
      toast({ title: "Action failed", description: err?.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const runTitleAndSubtitleCleanup = async () => {
    if (!article) return;
    setActionLoading("titles");
    try {
      const normalizedTitle = article.title.replace(/^#+\s*/, "").replace(/\s+/g, " ").trim();
      const normalizedContent = article.content
        .split("\n")
        .map((line) => {
          if (!/^#{1,3}\s+/.test(line.trim())) return line;
          const prefix = line.match(/^#{1,3}/)?.[0] || "##";
          const heading = line.replace(/^#{1,3}\s+/, "").replace(/\s+/g, " ").trim();
          return `${prefix} ${heading}`;
        })
        .join("\n");

      const { error: applyError } = await supabase.functions.invoke("content-upgrade", {
        body: { action: "apply", id: article.id, title: normalizedTitle, content: normalizedContent },
      });
      if (applyError) throw new Error(applyError.message);

      await reloadCurrentArticle(article.id);
      toast({ title: "Title and subtitles cleaned" });
    } catch (err: any) {
      toast({ title: "Action failed", description: err?.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const runCleanupFix = async (fixes: Record<string, any>, successMessage: string) => {
    if (!article) return;
    setActionLoading("fix");
    try {
      const { data, error } = await supabase.functions.invoke("bulk-cleanup", { body: { action: "fix", article_id: article.id, fixes } });
      if (error) throw new Error(error.message);
      if (data?.deleted_article) {
        toast({ title: successMessage });
        navigate("/blog", { replace: true });
        return;
      }
      if (data?.moved_to_raw) {
        toast({ title: "Could not parse MCQs — moved to Raw in Admin", description: "Open Admin panel to review this article manually." });
        await reloadCurrentArticle(article.id);
        return;
      }
      await reloadCurrentArticle(article.id);
      toast({ title: successMessage });
    } catch (err: any) {
      toast({ title: "Action failed", description: err?.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const runDirectMigrate = async () => {
    if (!article) return;
    setActionLoading("fix");
    try {
      const { data, error } = await supabase.functions.invoke("bulk-cleanup", {
        body: { action: "fix", article_id: article.id, fixes: { migrate_mcqs: true, auto_route_essay: true, fallback_to_raw: true } },
      });
      if (error) throw new Error(error.message);
      if (data?.migrated_essays) {
        toast({ title: "Detected essay format — moved to Essays" });
        navigate("/essays", { replace: true });
        return;
      }
      if (data?.deleted_article) {
        toast({ title: `Migrated ${data.migrated_mcqs || 0} MCQs → MCQ section` });
        navigate("/blog", { replace: true });
        return;
      }
      if (data?.moved_to_raw) {
        toast({ title: "MCQ parse failed — moved to Raw in Admin" });
        await reloadCurrentArticle(article.id);
        return;
      }
      await reloadCurrentArticle(article.id);
      toast({ title: "No MCQs found, article unchanged" });
    } catch (err: any) {
      toast({ title: "Action failed", description: err?.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  useEffect(() => {
    if (!slug) { setLoading(false); return; }
    // Retry transient network/CDN failures before declaring the article missing —
    // a flaky connection must never render "Article unavailable".
    const fetchWithRetry = async (attempt = 0): Promise<any> => {
      try {
        return await getArticleBySlugOrId(slug);
      } catch (err) {
        if (attempt >= 3) throw err;
        await new Promise((r) => setTimeout(r, 400 * Math.pow(2, attempt)));
        return fetchWithRetry(attempt + 1);
      }
    };

    fetchWithRetry()
      .then((a) => {
        if (!a) {
          setNotFound(true);
          findClosestArticle(slug).then((match) => {
            if (!match) return;
            if (match.score >= 0.6) {
              navigate(match.path, { replace: true });
            } else {
              setSuggestion({ id: match.id, title: match.title, path: match.path });
            }
          }).catch(() => {});
          document.title = "Article Not Found";
          let noindex = document.querySelector('meta[name="robots"]');
          if (!noindex) {
            noindex = document.createElement("meta");
            noindex.setAttribute("name", "robots");
            document.head.appendChild(noindex);
          }
          noindex.setAttribute("content", "noindex, nofollow");
          const canonical = document.querySelector('link[rel="canonical"]');
          if (canonical) canonical.remove();
          return;
        }

        const noindex = document.querySelector('meta[name="robots"]');
        if (noindex) noindex.remove();

        setNotFound(false);
        setArticle(scanFirst(a));
        // a blog that has been tidied (headings, short paragraphs, lists) shows the tidied text; the stored one is never changed
        void tidiedText(a.id).then((fixed) => { if (fixed) setArticle((cur) => (cur && cur.id === a.id && !polishedIds.has(a.id) ? { ...cur, content: fixed } : cur)); });
        // Year 1 to 3: the polished copy (title, description, text) is shown when it exists. The first visitor to a blog starts the polish; everyone after gets it saved.
        if (wantsPolish(a as { category?: string | null; password_protected?: boolean | null })) {
          void (async () => {
            let p = await getPolish(a.id);
            const show = (q: Polish | null) => { if (q) setArticle((cur) => (cur && cur.id === a.id ? applyPolish(cur, q) : cur)); };
            show(p);
            // nothing yet, or a long page part-way: ask the server, and keep asking for the next piece while this page is open
            const longWaiting = Boolean(p && p.status === "done" && !p.content && /left for later|too long|rejected in part/i.test(p.reason ?? "") && (a.content ?? "").length > 14000);
            if (!p || p.status === "partial" || longWaiting) {
              const here = window.location.pathname;
              setPolishNote("Making this page cleaner…");
              try {
                let hiccups = 0;
                for (let n = 0; n < 30; n++) {
                  const r = await requestPolish(a.id, n > 0);
                  if (r.hiccup && ++hiccups > 4) break; // the AI is busy: the next visit carries on
                  if (r.status === "done" || r.status === "partial") { p = (await getPolish(a.id, true)) ?? p; show(p); }
                  if (r.progress && r.more) setPolishNote(`Making this page cleaner… part ${r.progress.replace("/", " of ")}`);
                  if ((!r.more && !r.hiccup) || window.location.pathname !== here) break;
                  await new Promise((res) => setTimeout(res, r.hiccup ? 6000 : 500));
                }
              } finally { setPolishNote(""); }
            }
          })();
        }
        const canonicalPath = buildBlogPath(a);
        if (location.pathname !== canonicalPath) navigate(`${canonicalPath}${location.hash || ""}`, { replace: true });
        if (a.category) getRelatedContent(a.category, a.id).then(setRelated);
      })
      .catch(() => {
        // Network still failing: keep the shell, show offline messaging instead of "removed".
        setIsOffline(true);
        setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [slug, navigate, location.pathname, location.hash]);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  const toc = useMemo(() => article ? extractToc(article.content) : [], [article]);
  const slideDeck = useMemo(() => (article ? parseSlideDeck(article.content || "") : null), [article]);
  // Drugs the note mentions and the drug guides that match its title, for the Pharmacology connections card.
  const pharm = useMemo(() => (article ? {
    ids: findDrugIds(article.content || "", drugIndex as { id: string; name: string; terms: string[] }[]),
    conds: matchConditions(`${article.title || ""} ${article.category || ""}`),
  } : null), [article]);
  const leaveToPharm = (to: string) => {
    if (!article) return;
    setNoteReturn({ path: `${location.pathname}${location.search}`, title: article.title || "the note", y: window.scrollY });
    navigate(to);
  };

  // Focus: the reader can hide the section tabs while they read; the choice is remembered on this device
  const [tabsHidden, setTabsHidden] = useState<boolean>(() => { try { return localStorage.getItem("ompath_tabs_hidden") === "1"; } catch { return false; } });
  const setTabs = (hidden: boolean) => { setTabsHidden(hidden); try { localStorage.setItem("ompath_tabs_hidden", hidden ? "1" : "0"); } catch { /* storage blocked */ } };

  useEffect(() => {
    if (toc.length < 2 || tabsHidden) return;
    document.body.classList.add("has-toc-bar");
    return () => document.body.classList.remove("has-toc-bar");
  }, [toc.length, tabsHidden]);

  // Which section the reader is in: the last heading that has reached the top of the screen. Works the same on phone and desktop.
  useEffect(() => {
    if (!toc.length) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      let cur = toc[0].id;
      for (const item of toc) {
        const el = document.getElementById(item.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= 160) cur = item.id; else break;
      }
      setActiveSection(cur);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [toc, loading, noteReady]);
  const chipBar = useRef<HTMLDivElement>(null);
  const barTouched = useRef(0); // when the reader last touched the bar: it stops following their reading for a few seconds so it never fights their swipe
  const activeChip = useMemo(() => {
    const idx = toc.findIndex((t) => t.id === activeSection);
    for (let i = idx; i >= 0; i--) if (toc[i].level <= 2) return toc[i].id;
    return toc.find((t) => t.level <= 2)?.id ?? "";
  }, [toc, activeSection]);
  useEffect(() => {
    const bar = chipBar.current; if (!bar || !activeChip) return;
    if (Date.now() - barTouched.current < 4000) return;
    const el = bar.querySelector<HTMLElement>(`[data-chip="${activeChip}"]`);
    if (el) bar.scrollTo({ left: el.offsetLeft - bar.clientWidth / 2 + el.clientWidth / 2, behavior: "smooth" });
  }, [activeChip]);

  useEffect(() => {
    if (!article) return;
    const metaTitle = cleanMetaTitle(article);
    const metaDesc = cleanMetaDescription(article);
    const ogImage = article.og_image_url || extractFirstImageFromContent(article.content || "") || `${SITE_URL}/og-default.png`;
    const canonicalUrl = `${SITE_URL}${buildBlogPath(article)}`;
    const plain = stripRichText(article.content || "");
    const year = getYearFromCategory(article.category || "");
    const unit = getCategoryDisplayName(article.category || "") || "Medical Notes";
    const keywords = [
      unit, `${unit} notes`, `${unit} MCQs`, `${unit} past paper`,
      year ? `Year ${year} MBChB` : "MBChB",
      "Mount Kenya University", "MKU", "UON", "KU", "Moi University",
      "medical school Kenya", "past papers with answers", "revision notes",
    ].filter(Boolean) as string[];

    updateMetaTags({
      title: metaTitle,
      description: metaDesc,
      image: ogImage,
      url: canonicalUrl,
      type: "article",
      keywords,
    });

    // Everything published is indexable. Image/slide-heavy articles have little
    // plain text but real value, so length or scan watermarks must never noindex
    // a page — only a hard 404 (handled above) stays out of the index.
    let robots = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    if (!robots) {
      robots = document.createElement("meta");
      robots.setAttribute("name", "robots");
      document.head.appendChild(robots);
    }
    robots.setAttribute("content", "index, follow, max-image-preview:large, max-snippet:-1");

    let ldScript = document.querySelector("script[data-article-ld]") as HTMLScriptElement | null;
    if (!ldScript) {
      ldScript = document.createElement("script");
      ldScript.type = "application/ld+json";
      ldScript.setAttribute("data-article-ld", "true");
      document.head.appendChild(ldScript);
    }
    ldScript.textContent = JSON.stringify([
      {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": metaTitle.slice(0, 110),
        "description": metaDesc,
        "image": ogImage,
        "url": canonicalUrl,
        "mainEntityOfPage": { "@type": "WebPage", "@id": canonicalUrl },
        "inLanguage": "en",
        "isAccessibleForFree": true,
        "keywords": keywords.join(", "),
        "articleSection": unit,
        "wordCount": plain.split(/\s+/).filter(Boolean).length,
        "educationalLevel": year ? `Year ${year} (MBChB)` : "Undergraduate medicine",
        "learningResourceType": "Study notes and past paper questions",
        "datePublished": article.created_at,
        "dateModified": (article as { updated_at?: string }).updated_at || article.created_at,
        "author": { "@type": "Organization", "name": "Ompath Study", "url": SITE_URL },
        "publisher": {
          "@type": "Organization",
          "name": "Ompath Study",
          "url": SITE_URL,
          "logo": { "@type": "ImageObject", "url": `${SITE_URL}/favicon.png` },
        },
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
          { "@type": "ListItem", position: 2, name: "Notes", item: `${SITE_URL}/blog` },
          ...(year ? [{ "@type": "ListItem", position: 3, name: `Year ${year}`, item: `${SITE_URL}/year/${year}` }] : []),
          { "@type": "ListItem", position: year ? 4 : 3, name: unit, item: `${SITE_URL}/blog?category=${encodeURIComponent(article.category || "")}` },
          { "@type": "ListItem", position: year ? 5 : 4, name: metaTitle.slice(0, 110), item: canonicalUrl },
        ],
      },
    ]);

    return () => {
      const ldEl = document.querySelector("script[data-article-ld]");
      if (ldEl) ldEl.remove();
    };
  }, [article]);

  if (loading) {
    // a page-shaped placeholder, tall enough that the footer is below the screen, so nothing jumps when the note arrives
    return (
      <div className="mx-auto min-h-[120vh] max-w-3xl px-4 py-8" aria-busy="true" aria-label="Loading the note">
        <div className="h-3 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-9 w-11/12 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-9 w-2/3 animate-pulse rounded bg-muted" />
        <div className="mt-8 space-y-3">
          {Array.from({ length: 14 }, (_, i) => <div key={i} className="h-4 animate-pulse rounded bg-muted" style={{ width: `${96 - ((i * 37) % 28)}%` }} />)}
        </div>
      </div>
    );
  }

  if (notFound || !article) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h1 className="mb-2 text-2xl font-bold text-foreground">
          {isOffline ? "You're offline" : "Article unavailable"}
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {isOffline
            ? "We couldn't load this article without an internet connection. Reconnect and tap retry."
            : "This link may have changed or the article was removed. Try one of the options below."}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {isOffline && (
            <Button variant="default" onClick={() => window.location.reload()}>Retry</Button>
          )}
          {suggestion && !isOffline && (
            <Button asChild variant="default">
              <Link to={suggestion.path}>Open closest match: {suggestion.title}</Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link to="/blog"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Study Notes</Link>
          </Button>
        </div>
      </div>
    );
  }

  const date = new Date(article.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const unitName = getCategoryDisplayName(article.category);
  const yearName = getYearFromCategory(article.category);
  // a past paper gets a one-line summary instead of a long description: how many questions and whether answers are in
  const paperLine = (() => {
    const asTitle = String(article.title ?? "");
    if ((article as { content_type?: string | null }).content_type === "Notes" || /(notes?|revision|summary|guide)/i.test(asTitle) || !isPaperTitle(asTitle)) return ""; // revision notes about a CAT are notes, not a paper
    const c = String(article.content || "");
    const q = (c.match(/^\s*(?:#{1,4}\s*)?\**\s*(?:Question\s*)?\d{1,3}\s*[.)]/gim) || []).length;
    const a = (c.match(/^\s*[*_✅✔\s]*(?:model\s+)?answers?\b\s*[:*-]/gim) || []).length;
    if (q < 3) return ""; // timetables, notices and outlines keep the normal header
    const parts = [unitName && unitName !== "Uncategorized" ? `${unitName} past paper` : "Past paper"];
    parts.push(`${q} questions`);
    parts.push(a >= Math.max(3, q * 0.5) ? "answers and explanations included" : a >= 3 ? "some answers included" : "questions only");
    return parts.join(" · ");
  })();
  const hasRelated = related.flashcards.length > 0 || related.mcqs.length > 0;
  const articleEssay = related.essays?.[0];
  // stored practice questions that are really headings or plain statements (made badly from the notes) are not shown
  const realEssay = (q: any) => {
    const t = String(q?.question ?? "").trim();
    return t.length >= 15 && !/^#/.test(t) && (/\?\s*$/.test(t) || /^(describe|explain|discuss|outline|define|state|list|name|enumerate|compare|contrast|differentiate|distinguish|write|give|mention|what|how|why|when|which|where|who|a \d|an? \w+-year)/i.test(t)) && String(q?.model_answer || q?.answer || "").trim().length >= 25;
  };
  const essaySaqs: any[] = (Array.isArray(articleEssay?.short_answer_questions) ? articleEssay.short_answer_questions : []).filter(realEssay);
  const essayLaqs: any[] = (Array.isArray(articleEssay?.long_answer_questions) ? articleEssay.long_answer_questions : []).filter(realEssay);

  const bandHero = !slideDeck && !(article as any).password_protected;
  const heroEl = (
    <ClassicHero
      band={bandHero}
      minutes={Math.max(1, Math.round((article.content || "").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").split(/\s+/).length / 210))}
      summaryId={article.slug ? `a:${article.slug}` : undefined}
      articleId={article.id}
      studyPath={buildBlogPath(article)}
      studyText={(article.content || "").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/<[^>]+>/g, " ").slice(0, 6000)}
      title={decodeEntities(article.title || "").replace(/^#+\s*/, "").replace(/\s+/g, " ").trim() || cleanMetaTitle(article)}
      image={usableImage(article)}
      imageHint={(article as { image_query?: string }).image_query}
      date={date}
      unit={unitName && unitName !== "Uncategorized" ? unitName : ""}
      shareUrl={`${SITE_URL}${buildBlogPath(article)}`}
      description={cleanMetaDescription(article)}
      category={article.category}
      paperLine={paperLine}
    />
  );
  return (
    <>
      <ReadingProgress />
      <ExamPreviewBall onOpen={() => setPreviewOpen(true)} />
      {!slideDeck && toc.length > 1 && (tabsHidden ? (
        <button type="button" onClick={() => setTabs(false)} aria-label="Show the section tabs" className="fixed bottom-3 left-3 z-40 inline-flex h-10 items-center gap-1.5 rounded-full border border-border bg-background/95 px-3.5 text-xs font-bold text-foreground shadow-md backdrop-blur lg:hidden print:hidden"><ListChecks className="h-4 w-4 text-primary" aria-hidden /> Sections</button>
      ) : (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur lg:hidden print:hidden">
          <div className="flex items-center">
            <button type="button" onClick={() => setTabs(true)} aria-label="Hide the section tabs to focus" title="Hide to focus" className="ml-1.5 shrink-0 rounded-full p-2.5 text-muted-foreground hover:text-foreground"><EyeOff className="h-4 w-4" aria-hidden /></button>
          <div ref={chipBar} onPointerDown={() => { barTouched.current = Date.now(); }} className="flex min-w-0 flex-1 gap-1 overflow-x-auto py-2 pl-1 pr-3 text-sm font-semibold [scrollbar-width:none]" role="navigation" aria-label="On this page">
            {toc.filter((t) => t.level <= 2).slice(0, 40).map((t) => <a key={t.id} data-chip={t.id} href={`#${t.id}`} aria-current={activeChip === t.id ? "true" : undefined} className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 transition-colors ${activeChip === t.id ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{t.text}</a>)}
          </div>
          </div>
        </div>
      ))}

      {/* Breadcrumbs */}
      <div className="border-b border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-5 py-3 flex items-center gap-2 text-sm text-muted-foreground overflow-x-auto">
          <button onClick={handleBack} className="shrink-0 hover:text-foreground transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <ChevronRight className="h-3 w-3 shrink-0" />
          <Link to="/blog" className="shrink-0 hover:text-foreground transition-colors">Study Notes</Link>
          {yearName && (
            <>
              <ChevronRight className="h-3 w-3 shrink-0" />
              <Link to={`/blog?year=${encodeURIComponent(yearName)}`} className="shrink-0 hover:text-foreground transition-colors">{yearName}</Link>
            </>
          )}
          {unitName && unitName !== "Uncategorized" && (
            <>
              <ChevronRight className="h-3 w-3 shrink-0" />
              <span className="truncate text-foreground font-medium">{unitName}</span>
            </>
          )}
        </div>
      </div>

      {/* Admin toolbar */}
      {isAdmin && (
        <div className="border-b-2 border-primary/30 bg-primary/5">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-5 py-3">
            <span className="mr-1 text-xs font-bold uppercase tracking-wider text-primary">Admin</span>
            {aiNote && <span className="text-xs font-semibold text-muted-foreground" role="status">{aiNote}</span>}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="h-8 gap-1.5 text-xs bg-primary hover:bg-primary/90" disabled={!!actionLoading}>
                  {actionLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  AI tools
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={runTidy}>Tidy this note (preview first)</DropdownMenuItem>
                <DropdownMenuItem onClick={async () => {
                  if (!article) return;
                  setActionLoading("image");
                  try {
                    const { data, error } = await supabase.functions.invoke("note-images", { body: { article_id: article.id } });
                    if (error) throw new Error(error.message);
                    if (data?.error) throw new Error(data.error);
                    toast({ title: data?.added ? `${data.added} relevant picture${data.added === 1 ? "" : "s"} added` : "No picture was clearly relevant", description: data?.pictures?.join(", ") });
                    await reloadCurrentArticle(article.id);
                  } catch (err: any) {
                    toast({ title: "Could not add pictures", description: err?.message, variant: "destructive" });
                  } finally { setActionLoading(null); }
                }}><ImagePlus className="mr-2 h-3.5 w-3.5" />Add relevant pictures</DropdownMenuItem>
                <DropdownMenuItem onClick={runGenerateSaqs}>Add short-answer questions at the end</DropdownMenuItem>
                <DropdownMenuItem onClick={() => runCleanupFix({ move_to_raw: true }, "Moved to Raw")}>Unpublish (move to Raw)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      <SearchHighlightBar term={new URLSearchParams(location.search).get("hl")} ready={Boolean(article)} />

      {bandHero && heroEl}

      {/* Main layout */}
      <div className="mx-auto max-w-[76rem] px-4 py-5 pb-20 sm:px-6 sm:py-10 lg:pb-12">
        <div className={slideDeck ? "" : "lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-14"}>
          {!slideDeck && (
            <aside className="hidden lg:block">
              <div className="sticky top-24 max-h-[calc(100dvh-7rem)] space-y-4 overflow-y-auto pr-1">
                {toc.length > 0 ? <SidebarToc items={toc} activeId={activeSection} /> : <QuestionIndex />}
              </div>
            </aside>
          )}

          <article id="section-top" className={slideDeck ? "min-w-0" : "min-w-0 px-1 py-3 sm:py-6"}>
            <Countdown data={(article as any).countdown} />
            <PasswordGate
              enabled={(article as any).password_protected}
              password={(article as any).access_password}
              storageKey={article.slug || article.id}
            >
            {false && polishNote && ( // visitors are not told a page is being polished: the better text simply replaces the old one
              <div role="status" aria-live="polite" className="mb-3 flex items-center gap-2.5 rounded-full border border-primary/30 bg-primary/5 px-4 py-2 text-[13px] font-semibold text-primary print:hidden">
                <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-primary" aria-hidden />
                <span>{polishNote}</span>
                <span className="ml-auto hidden h-1.5 w-24 overflow-hidden rounded-full bg-primary/15 sm:block" aria-hidden><span className="block h-full w-1/2 animate-[pulse_1.2s_ease-in-out_infinite] rounded-full bg-primary/60" /></span>
              </div>
            )}
            {!bandHero && heroEl}

            <SourceAttribution article={article} />

            <div className="not-prose mb-5"><StudyControls resourceType="article" resourceId={article.id} title={cleanMetaTitle(article)} /></div>

            <HtmlEmbed data={(article as any).html_embed} position="top" />
            <VimeoEmbed url={(article as any).html_embed?.vimeo_url} />

            {(article as any).toc_enabled && <ContentToc content={article.content} />}

            {!slideDeck && pharm && (pharm.conds.length > 0 || pharm.ids.length >= 2) && (
              <PharmacologyConnections ids={pharm.ids} conditionIds={pharm.conds} leave={leaveToPharm} className="mb-5" />
            )}

            {!slideDeck && canCondense(article) && <NoteModeSwitch quick={quickView} onChange={setQuickView} />}
            <div className="prose-custom article-reader">
              <KeywordLinkProvider currentPath={buildBlogPath(article)} currentCategory={article.category} currentTitle={article.title}>
                {slideDeck
                  ? <SlideDeckView
                      deck={slideDeck}
                      articleId={article.id}
                      title={cleanMetaTitle(article)}
                      university="Ompath Study"
                      onPreview={() => setPreviewOpen(true)}
                    />
                  : <ArticleContent content={quickView && canCondense(article) ? condenseNote(article.content) : article.content} articleId={article.id} category={article.category || ""} title={article.title || ""} contentKind={article.content_kind || ""} />}
              </KeywordLinkProvider>
            </div>

            {!slideDeck && (
              <ArticleSubscribeGate
                hasMcqs={/(?:^|\n)\s*(?:✅\s*)?(?:answer|correct answer)\s*[:：]/i.test(article.content || "")}
              />
            )}

            <HtmlEmbed data={(article as any).html_embed} position="bottom" />

            {Array.isArray((article as any).tags) && (article as any).tags.length > 0 && (
              <div className="mt-8 flex flex-wrap gap-2 border-t border-border pt-5">
                {(article as any).tags.slice(0, 8).map((tag: string) => (
                  <a
                    key={tag}
                    href={`https://www.google.com/search?q=${encodeURIComponent(`${tag} site:ompathstudy.com`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
                  >
                    #{tag}
                  </a>
                ))}
              </div>
            )}

            <div className="mt-10 pt-6 border-t border-border">
              <div className="mb-5"><HelpfulVote resourceType="article" resourceId={article.id} /></div>
              <ShareButtons
                url={`${SITE_URL}${buildBlogPath(article)}`}
                title={cleanMetaTitle(article)}
                description={cleanMetaDescription(article)}
                variant="full"
              />
            </div>

            {(essaySaqs.length > 0 || essayLaqs.length > 0) && (
              <section className="mt-12 border-t border-border pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <HelpCircle className="h-4 w-4 text-primary" />
                  <h2 className="font-serif text-xl font-bold text-foreground">Practice Essay Questions</h2>
                </div>
                {essaySaqs.length > 0 && (
                  <div className="mb-6">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Short Answer Questions</p>
                    <div className="space-y-2">
                      {essaySaqs.map((q: any, i: number) => (
                        <EssayQuestion
                          key={`saq-${i}`}
                          number={`${i + 1}`}
                          question={q.question || ""}
                          answer={q.model_answer || q.answer || ""}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {essayLaqs.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Long Answer Questions</p>
                    <div className="space-y-2">
                      {essayLaqs.map((q: any, i: number) => (
                        <EssayQuestion
                          key={`laq-${i}`}
                          number={`${i + 1}`}
                          question={q.question || ""}
                          answer={q.model_answer || q.answer || ""}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            <BooksForPage text={`${article.title} ${(article.content || "").slice(0, 4000)}`} className="mt-12" />
            <AdSlot />
            <NoteTopics text={article.content || ""} title={article.title} className="mt-10" />
            <SponsorLine className="mt-8" />

            {hasRelated && (
              <div className="mt-12 border-t border-border pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-foreground">Continue Learning</h3>
                </div>
                <div className="space-y-4">
                  {related.flashcards.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Flashcards</p>
                      <div className="space-y-1.5">
                        {related.flashcards.map((f: any) => (
                          <Link key={f.id} to={buildFlashcardPath(f)} className="flex items-center gap-3 rounded-lg border border-border p-3 hover:border-primary/40 hover:bg-muted/30 transition-colors">
                            <GraduationCap className="h-4 w-4 text-primary shrink-0" />
                            <span className="truncate text-sm font-medium text-foreground">{f.title}</span>
                            {(f.cards as any[])?.length > 0 && <span className="ml-auto text-xs text-muted-foreground">{(f.cards as any[]).length} cards</span>}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                  {related.mcqs.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">MCQ Quizzes</p>
                      <div className="space-y-1.5">
                        {related.mcqs.map((m: any) => (
                          <Link key={m.id} to={buildMcqPath(m)} className="flex items-center gap-3 rounded-lg p-2.5 hover:bg-muted/40 transition-colors">
                            <ListChecks className="h-4 w-4 text-primary shrink-0" />
                            <span className="truncate text-sm font-medium text-foreground">{m.title}</span>
                            {m.question_count > 0 && <span className="ml-auto text-xs text-muted-foreground">{m.question_count} Qs</span>}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {related.articles && related.articles.length > 0 && (
              <section className="mt-12 border-t border-border pt-8">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <h2 className="font-serif text-xl font-bold text-foreground">Related Articles</h2>
                  </div>
                  <span className="text-xs text-muted-foreground">Tap or hover to pause · swipe</span>
                </div>
                <RelatedMarquee articles={related.articles} />
              </section>
            )}

            {!slideDeck && <ArticleNav id={article.id} category={article.category} createdAt={(article as any).created_at} />}
            {(article as any).comments_enabled !== false && <ArticleComments articleId={article.id} />}
            {!slideDeck && (
              <div className="mt-14 grid gap-6 border-t border-border pt-8 lg:grid-cols-2">
                <StudyPanel year={Number(/Years*([1-6])/i.exec(yearName || "")?.[1]) || null} />
                <ConnectedLearning target={{ id: `note:${article.id}`, title: article.title, where: article.category, year: Number((yearName || "").match(/[1-6]/)?.[0]) || null }} />
              </div>
            )}
            </PasswordGate>
          </article>
          {slideDeck ? (
            <SlidePreviewModal
              deck={slideDeck}
              title={cleanMetaTitle(article)}
              university="Ompath Study"
              open={previewOpen}
              onClose={() => setPreviewOpen(false)}
            />
          ) : (
            <ExamPreviewModal article={article} open={previewOpen} onClose={() => setPreviewOpen(false)} />
          )}
        </div>
      </div>
    </>
  );
}

function RelatedMarquee({ articles }: { articles: any[] }) {
  const [paused, setPaused] = useState(false);
  const list = [...articles.slice(0, 12), ...articles.slice(0, 12)];
  return (
    <div
      className="group relative -mx-5 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      onTouchStart={() => setPaused(true)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onClick={() => setPaused((p) => !p)}
    >
      <div
        className="flex w-max gap-3 px-5 animate-marquee-slow"
        style={{ animationPlayState: paused ? "paused" : "running" }}
      >
        {list.map((a: any, i: number) => (
          <RelatedArticleCard key={`${a.id}-${i}`} article={a} compact />
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent" />
    </div>
  );
}
