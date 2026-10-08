import { BookOpen, ClipboardList, File, FileText, FolderOpen, GraduationCap, Layers, Newspaper, Presentation, Film, Image as ImageIcon } from "lucide-react";
import type { SiteHit } from "@/lib/siteSearch";

export function HitIcon({ hit, className = "h-4 w-4" }: { hit: SiteHit; className?: string }) {
  const Icon = hit.group === "Notes" ? BookOpen : hit.group === "Outline topics" ? ClipboardList : hit.group === "Pages" ? Layers : hit.group === "Stories" ? Newspaper : hit.group === "MCQs & flashcards" ? GraduationCap
    : hit.kind === "ppt" ? Presentation : hit.kind === "video" ? Film : hit.kind === "img" ? ImageIcon : hit.kind === "pdf" || hit.kind === "doc" ? FileText : hit.group === "Units" ? FolderOpen : File;
  return <Icon className={`${className} text-primary`} aria-hidden="true" />;
}
