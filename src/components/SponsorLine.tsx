import { useMonetise } from "@/lib/monetise";

/** "Supported by <name>": one quiet line, shown only when the admin has added a sponsor. */
export default function SponsorLine({ className = "" }: { className?: string }) {
  const { sponsor } = useMonetise();
  if (!sponsor.enabled || !sponsor.name) return null;
  const inner = <>{sponsor.line || "Supported by"} <strong className="font-semibold text-foreground/80">{sponsor.name}</strong></>;
  return <p className={`text-xs text-muted-foreground ${className}`}>{/^https:\/\//.test(sponsor.url) ? <a href={sponsor.url} target="_blank" rel="noopener noreferrer sponsored" className="hover:underline">{inner}</a> : inner}</p>;
}
