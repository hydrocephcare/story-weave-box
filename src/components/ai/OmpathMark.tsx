/**
 * The Ompath AI logo: a ring (the "O" of Ompath) with a gold spark, on navy. The same artwork is in public/brand/ompath-ai.svg
 * for partners; keep the two in step. `plain` drops the tile so it sits on any background.
 */
export default function OmpathMark({ className = "h-9 w-9", plain = false }: { className?: string; plain?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Ompath AI" xmlns="http://www.w3.org/2000/svg">
      {!plain && <rect width="64" height="64" rx="15" fill="#0b2545" />}
      <circle cx="32" cy="32" r="16" fill="none" stroke={plain ? "#0b2545" : "#ffffff"} strokeWidth="5.2" className={plain ? "dark:stroke-white" : undefined} />
      <path d="M32 21.5l3.1 7.4 7.4 3.1-7.4 3.1L32 42.5l-3.1-7.4-7.4-3.1 7.4-3.1z" fill="#f2b632" />
    </svg>
  );
}
