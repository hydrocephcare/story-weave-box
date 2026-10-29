import { Activity, BarChart3, Bone, BookOpen, Brain, Bug, Baby, Dna, Droplets, Eye, FlaskConical, Heart, Microscope, MessageCircle, Pill, Scissors, ShieldCheck, Stethoscope, Syringe, Users, type LucideIcon } from "lucide-react";
import { tileColors } from "@/lib/blogImage";

/** A unit always wears its own subject: a colour taken from the unit's name and an icon for the subject, never a stock photograph that may not match. */
const ICONS: [RegExp, LucideIcon][] = [
  [/anatom|aponeur|embryo|histolog|osteo|bone|ortho/i, Bone],
  [/neuro|brain|psych|mental/i, Brain],
  [/cardi|heart|vascular/i, Heart],
  [/physiolog|renal|respirat|gastro|git\b|endocrin/i, Activity],
  [/biochem|chemi|molecular biology/i, FlaskConical],
  [/immun|virolog|serolog/i, ShieldCheck],
  [/microbio|bacteri|parasit|entomolog|infect/i, Bug],
  [/patholog|haemat|hemat|histopath|cytolog/i, Microscope],
  [/pharmac|drug|toxic/i, Pill],
  [/genetic|cytogenet|dna|genom/i, Dna],
  [/surg|trauma|operat|anaesth/i, Scissors],
  [/obstet|gynae|gynec|paed|pediatr|neonat|child/i, Baby],
  [/epidemi|statist|public health|community|research/i, BarChart3],
  [/communication|ethic|behaviour|social/i, MessageCircle],
  [/blood|transfus/i, Droplets],
  [/ophthal|eye|ent\b|ear\b/i, Eye],
  [/medicine|clinical|internal|emergency/i, Stethoscope],
  [/vaccin|inject/i, Syringe],
  [/people|family|community/i, Users],
];
/** A real picture of the subject (Wikimedia Commons, checked by eye, credits in docs/unit-image-credits.json). Units with no entry get the icon tile. */
const PHOTOS: [RegExp, string][] = [
  [/embryo/i, "embryology"], [/histolog/i, "histology"], [/anatom|aponeur/i, "anatomy"],
  [/immun/i, "immunology"], [/microbio|bacteri/i, "microbiology"], [/parasit|entomolog/i, "parasitology"], [/virolog/i, "virology"],
  [/biochem|metabol/i, "biochemistry"], [/genetic|cytogenet|molecular/i, "genetics"],
  [/physiolog|git/i, "physiology"], [/haemat|hemat|blood/i, "haematology"], [/patholog/i, "pathology"], [/pharmac/i, "pharmacology"],
  [/epidemi|statist|public health|community health/i, "epidemiology"], [/communication/i, "communication"],
  [/surg|orthop|trauma/i, "surgery"], [/obstet|gynae|gynec/i, "obstetrics"], [/paed|pediatr/i, "paediatrics"], [/psych|neuro/i, "psychiatry"],
  [/internal medicine|^medicine|clinical medicine/i, "medicine"],
];
const photoFor = (title: string) => { const k = PHOTOS.find(([re]) => re.test(title))?.[1]; return k ? `/unit-img/${k}.jpg` : ""; };
const iconFor = (title: string): LucideIcon => ICONS.find(([re]) => re.test(title))?.[1] ?? BookOpen;

export default function UnitTile({
  title,
  count,
  active,
  onClick,
  hint,
}: {
  title: string;
  count?: number;
  active?: boolean;
  onClick: () => void;
  hint?: string;
}) {
  const Icon = iconFor(title);
  const [c1, c2] = tileColors({ title, category: title });
  const photo = photoFor(title);
  return (
    <button
      onClick={onClick}
      className={`group flex h-full min-w-0 w-full flex-col overflow-hidden rounded-xl border bg-card text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md ${
        active ? "border-primary ring-2 ring-primary/20" : "border-border"
      }`}
    >
      <span className="relative flex aspect-[16/9] w-full shrink-0 items-center justify-center overflow-hidden bg-muted text-white" style={photo ? undefined : { backgroundImage: `linear-gradient(135deg, ${c1}, ${c2})` }}>
        {photo ? <img src={photo} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" /> : <Icon className="h-9 w-9 opacity-90 transition-transform duration-300 group-hover:scale-110" aria-hidden />}
      </span>
      <span className="flex min-h-[4.5rem] flex-1 flex-col px-3.5 py-3">
        <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-foreground transition-colors group-hover:text-primary sm:text-sm">
          {title}
        </span>
        <span className="mt-auto block pt-1.5 text-[11px] text-muted-foreground">
          {hint ?? (count != null ? `${count} ${count === 1 ? "note" : "notes"}` : "")}
        </span>
      </span>
    </button>
  );
}
