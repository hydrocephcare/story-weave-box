import { BadgeCheck } from "lucide-react";
import registry from "@/data/libraries.json";

/** "Compiled by Abongo": the badge used on the library pages, reused on books, notes, papers and outlines. */
export default function ContentCredit() {
  return (
    <div className="my-3">
      <p className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-bold text-primary">
        <BadgeCheck className="h-3.5 w-3.5" /> {registry.credit}
      </p>
    </div>
  );
}
