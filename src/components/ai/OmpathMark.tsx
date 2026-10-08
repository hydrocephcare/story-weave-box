import { useId } from "react";

/**
 * The Ompath AI mark: a medical cross inside a ring (the "O" of Ompath) with a spark of intelligence.
 * Drawn as SVG so it stays sharp at every size and needs no image download.
 */
export default function OmpathMark({ className = "h-9 w-9", plain = false }: { className?: string; plain?: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 40 40" className={className} role="img" aria-label="Ompath AI" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`g${id}`} x1="4" y1="2" x2="36" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#14b8a6" />
          <stop offset="0.55" stopColor="#4f46e5" />
          <stop offset="1" stopColor="#9333ea" />
        </linearGradient>
        <radialGradient id={`s${id}`} cx="0.3" cy="0.2" r="0.9">
          <stop offset="0" stopColor="#fff" stopOpacity="0.38" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {!plain && <rect x="1" y="1" width="38" height="38" rx="11" fill={`url(#g${id})`} />}
      {!plain && <rect x="1" y="1" width="38" height="38" rx="11" fill={`url(#s${id})`} />}
      <circle cx="19" cy="21.5" r="9.2" fill="none" stroke={plain ? `url(#g${id})` : "#fff"} strokeWidth="2.8" />
      <path d="M19 17.2v8.6M14.7 21.5h8.6" stroke={plain ? `url(#g${id})` : "#fff"} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M31.5 5.5l1.5 3.9 3.9 1.5-3.9 1.5-1.5 3.9-1.5-3.9-3.9-1.5 3.9-1.5z" fill="#fde68a" />
    </svg>
  );
}
