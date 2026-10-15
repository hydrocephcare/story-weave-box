/**
 * The Ompath AI mark: the Ompath Study logo (the O with the graduation cap, book and stethoscope) with a small gold spark that says "AI".
 * Default is a navy tile with the white-and-mint logo; `plain` drops the tile and picks the navy or white logo to suit light and dark pages.
 */
const Spark = () => (
  <svg viewBox="0 0 24 24" className="absolute -bottom-[6%] -right-[6%] h-[38%] w-[38%] drop-shadow" aria-hidden>
    <path d="M12 2l2.6 6.4L21 11l-6.4 2.6L12 20l-2.6-6.4L3 11l6.4-2.6z" fill="#f2b632" stroke="#0b2545" strokeWidth="1" />
  </svg>
);

export default function OmpathMark({ className = "h-9 w-9", plain = false, variant = "logo" }: { className?: string; plain?: boolean; variant?: "logo" | "ring" }) {
  // "ring": the original round Ompath AI icon (a ring with a gold spark). It is the closed button on the page; once the AI is open, the Ompath Study logo shows.
  if (variant === "ring") {
    return (
      <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Ompath AI" xmlns="http://www.w3.org/2000/svg">
        {!plain && <rect width="64" height="64" rx="15" fill="#0b2545" />}
        <circle cx="32" cy="32" r="16" fill="none" stroke={plain ? "#0b2545" : "#ffffff"} strokeWidth="5.2" className={plain ? "dark:stroke-white" : undefined} />
        <path d="M32 21.5l3.1 7.4 7.4 3.1-7.4 3.1L32 42.5l-3.1-7.4-7.4-3.1 7.4-3.1z" fill="#f2b632" />
      </svg>
    );
  }
  if (plain) {
    return (
      <span className={`relative inline-flex items-center justify-center ${className}`} role="img" aria-label="Ompath AI">
        <img src="/brand/mark-light.png" alt="" className="h-full w-auto object-contain dark:hidden" decoding="async" />
        <img src="/brand/mark-dark.png" alt="" className="hidden h-full w-auto object-contain dark:block" decoding="async" />
        <Spark />
      </span>
    );
  }
  return (
    <span className={`relative inline-flex items-center justify-center rounded-[24%] bg-[#0b2545] ${className}`} role="img" aria-label="Ompath AI">
      <img src="/brand/mark-dark.png" alt="" className="h-[74%] w-auto object-contain" decoding="async" />
      <Spark />
    </span>
  );
}
