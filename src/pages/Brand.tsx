import { Download } from "lucide-react";
import { Helmet } from "react-helmet-async";

const LOGOS = [
  { name: "Ompath Study", note: "The site, the app and general use.", file: "ompath-study", bg: "#0f766e" },
  { name: "Ompath AI", note: "The study assistant.", file: "ompath-ai", bg: "#0b2545" },
];
const COLOURS = [["Teal", "#0f766e"], ["Navy", "#0b2545"], ["Gold", "#f2b632"], ["White", "#ffffff"]];

/** /brand: the logos in the formats partners ask for, ready to download. */
export default function Brand() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-10 sm:py-14">
      <Helmet><title>Brand kit | Ompath Study</title><meta name="robots" content="noindex,follow" /></Helmet>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Ompath Study</p>
      <h1 className="mt-1 font-serif text-3xl font-bold sm:text-4xl">Brand kit</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">Logos for partners, organisers and the press. Please use them as they are: do not stretch, recolour or add effects.</p>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        {LOGOS.map((l) => (
          <section key={l.file} className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="flex items-center justify-center bg-muted/50 py-10"><img src={`/brand/${l.file}.svg`} alt={`${l.name} logo`} width="128" height="128" className="h-32 w-32 drop-shadow-sm" /></div>
            <div className="p-4">
              <h2 className="font-serif text-lg font-bold">{l.name}</h2>
              <p className="text-sm text-muted-foreground">{l.note}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {[["SVG", `${l.file}.svg`], ["PNG 512", `${l.file}-512.png`], ["PNG 1024", `${l.file}-1024.png`]].map(([label, file]) => (
                  <a key={file} href={`/brand/${file}`} download className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold hover:border-primary hover:text-primary"><Download className="h-3.5 w-3.5" /> {label}</a>
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>

      <h2 className="mt-10 font-serif text-xl font-bold">Colours</h2>
      <div className="mt-3 flex flex-wrap gap-3">
        {COLOURS.map(([n, hex]) => (
          <div key={hex} className="flex items-center gap-2 rounded-xl border border-border bg-card p-2 pr-4">
            <span className="h-9 w-9 rounded-lg border border-border" style={{ background: hex }} />
            <span className="text-sm"><strong className="block leading-tight">{n}</strong><span className="text-xs text-muted-foreground">{hex}</span></span>
          </div>
        ))}
      </div>
    </main>
  );
}
