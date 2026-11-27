import StoryCoverArt from "@/components/StoryCoverArt";
import { useEffect, useState } from "react";
import { BookOpen, ChevronRight, PenLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { authorFromTags, photoFromTags, uniFromTags } from "@/lib/storyAuthor";
import { isGeneratedThumb } from "@/lib/storyShare";

const STORIES_ORIGIN = "https://stories.ompathstudy.com";
const storyUrl = (slug?: string | null, id?: string, title?: string) => `${STORIES_ORIGIN}/stories/${slug || (id ? `${id}-${(title || "story").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}` : "")}`;
interface Row { id: string; title: string; slug?: string | null; category: string; created_at: string; cover_image_url: string | null; meta_description: string | null; tags: string[] | null }

function HomeStoryAuthor({ story }: { story: Row }) {
  const author = authorFromTags(story.tags);
  const year = Number(story.tags?.find((tag) => /^year-[1-8]$/.test(tag))?.slice(5)) || 0;
  if (!author) return year > 0 ? <p className="mt-2 text-[11px] font-medium text-muted-foreground">{year === 7 ? "Finalist" : year === 8 ? "Another course" : `Year ${year}`}</p> : null;
  const photo = photoFromTags(story.tags);
  const uni = uniFromTags(story.tags);
  const initial = author.name.replace(/^an?\s+/i, "").trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="mt-3 flex min-w-0 items-center gap-2.5">
      <span className="relative h-8 w-8 shrink-0">¶»§q«^