// The Finalist mark: a shield with a graduation cap. Used on story cards, the story header, the writer and the share page.
export default function FinalistBadge({ className = "h-6 w-6", label }: { className?: string; label?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 align-middle" title="Finalist">
      <svg viewBox="0 0 32 32" className={className} role="img" aria-label="Finalist">
        <defs>
          <linearGradient id="fb-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f5c542" />
            <stop offset="1" stopColor="#d97706" />
          </linearGradient>
        </defs>
        <path d="M16 1.8 28 6v8.6c0 7.2-4.9 12.6-12 15.6C8.9 27.200 4 21.800 4 14.600V6z" fill="url(#fb-g)" />
        <path d="M16 3.800 26 7.300v7.300c0 6.100-4.100 10.700-10 13.400-5.900-2.700-10-7.300-10-13.400V7.300z" fill="#1f2937" opacity=".92" />
        <path d="m16 9.500-7.500 3.700L16 17l7.500-3.800z" fill="#f8d56b" />
        <path d="M11 15.600v3.400c0 1.200 2.200 2.400 5 2.400s5-1.200 5-2.400v-3.400l-5 2.400z" fill="#f8d56b" opacity=".85" />
        <path d="M24.200 13.600v5" stroke="#f8d56b" strokeWidth="1.100" strokeLinecap="round" />
      </svg>
      {label && <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400">Finalist</span>}
    </span>
  );
}
