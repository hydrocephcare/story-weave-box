import type { CSSProperties } from "react";
import { hueFor } from "@/lib/heroHue";

/**
 * The moving colour behind the opening block of a page, in the colours of what the page is about.
 * Put it first inside a parent that is `relative isolate overflow-hidden`. Only transforms animate, so scrolling stays smooth.
 */
export default function HeroAurora({ about, year }: { about: string; year?: number | null }) {
  const [a, b, c] = hueFor(about, year);
  return <div className="hero-aurora" aria-hidden style={{ "--a": a, "--b": b, "--c": c } as CSSProperties}><span /><span /><span /></div>;
}
