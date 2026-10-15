import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, BarChart3, Bell, BookOpen, Building2, Check, Edit3, FileText, Globe, HardDrive, KeyRound, Layers, ListChecks, Search, Settings, Sparkles, Upload, Wallet, Wrench } from "lucide-react";
import AdminWorkspace, { type AdminNavGroup } from "@/components/admin/AdminWorkspace";

/**
 * The admin menu on the left, around every admin page. The main admin page has its own copy of the same menu; the tools that live at their own
 * address (visitors, polished blogs, comments, access rules...) used to open without it, so the menu disappeared. They are wrapped in this now.
 */
const tab = (id: string, label: string, icon: React.ElementType) => ({ id, label, icon });
const GROUPS: AdminNavGroup[] = [
  { label: "Tools", items: [
    tab("route:/admin/activity", "Activity & AI keys", Search),
    tab("route:/admin/analytics", "Visitors", BarChart3),
    tab("route:/admin/access", "Book access rules", KeyRound),
    tab("route:/admin/drafts", "AI notes to approve", Sparkles),
    tab("route:/admin/comments", "Comments", Bell),
    tab("route:/admin/duplicates", "Repeated pages", Layers),
    tab("route:/admin/thin-topics", "Deep exam notes", Layers),
    tab("route:/admin/content-checks", "Content checks", Check),
    tab("route:/admin/polish", "Polished blogs", Wrench),
    tab("route:/admin/content-health", "Content health", AlertTriangle),
    tab("route:/admin/monetise", "Monetise", Wallet),
    tab("route:/admin/outline-sync", "Course outline sync", Layers),
    tab("route:/admin/study-system", "Study system", BookOpen),
    tab("route:/admin/contests", "Contests", ListChecks),
    tab("route:/admin/tools", "All admin tools", Settings),
  ] },
  { label: "Content", items: [
    tab("create", "Create", FileText), tab("route:/admin/editor", "Editor", Edit3), tab("articles", "Articles", FileText), tab("route:/admin/categories", "Categories", Layers),
    tab("flashcards", "Flashcards", Layers), tab("mcqs", "MCQs", ListChecks), tab("stories", "Stories", BookOpen), tab("exams", "Exam Results", ListChecks),
  ] },
  { label: "System", items: [
    tab("institutions", "Institutions", Building2), tab("payments", "Payments", Settings), tab("notifications", "Notifications", Bell), tab("students", "MKU students", Check),
    tab("google-drive", "Google Drive", HardDrive), tab("seo", "SEO & Indexing", Globe), tab("import", "Import", Upload), tab("settings", "Settings", Settings),
  ] },
];
const LABELS = new Map(GROUPS.flatMap((g) => g.items).map((i) => [i.id, i.label]));

export default function AdminShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  // /admin/contests/setup belongs under "Contests", and so on: the longest menu path that starts the address wins
  const here = GROUPS.flatMap((g) => g.items).map((i) => i.id).filter((id) => id.startsWith("route:") && (pathname === id.slice(6) || pathname.startsWith(`${id.slice(6)}/`))).sort((a, b) => b.length - a.length)[0] ?? "";
  return (
    <AdminWorkspace
      activeId={here}
      activeLabel={LABELS.get(here) ?? "Admin"}
      groups={GROUPS}
      onSelect={(id) => navigate(id.startsWith("route:") ? id.slice(6) : `/admin#${id}`)}
      onViewSite={() => navigate("/")}
    >
      {children}
    </AdminWorkspace>
  );
}
