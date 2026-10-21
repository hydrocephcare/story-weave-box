import { useLocation } from "react-router-dom";
import data from "@/data/sections.json";

/** The course sections of Ompath Study: MBChB is the original; each section below it has its own home, menu, papers and sitemap. */
export interface Section { slug: string; name: string; title: string; blurb: string; categories: string[] }
export const SECTIONS = data as Section[];
export type SectionSlug = "dental" | "it" | "business" | "hospitality" | "social" | "science";

export const sectionBySlug = (s: string): Section | undefined => SECTIONS.find((x) => x.slug === s);
export const sectionOfCategory = (cat: string): Section => SECTIONS.find((s) => s.categories.includes(cat)) ?? SECTIONS[SECTIONS.length - 1];
/** The section a path belongs to (/it/papers/... is the IT section), if any. */
export const sectionFromPath = (pathname: string): Section | undefined => SECTIONS.find((s) => pathname === `/${s.slug}` || pathname.startsWith(`/${s.slug}/`));

/** The section the current page belongs to (defaults to dental). */
export function useSection(): Section { const { pathname } = useLocation(); return sectionFromPath(pathname) ?? SECTIONS[0]; }
