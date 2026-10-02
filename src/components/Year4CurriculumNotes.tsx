import { BookOpen, ChevronRight, Stethoscope } from "lucide-react";
import type { CourseOutline, OutlineItem } from "@/data/courseOutlines";
import { IMED_DISEASE_THEORY } from "@/data/imedDiseaseTheory";
import { YEAR4_ROTATION_THEORY, type RotationTheory } from "@/data/year4RotationTheory";

type Theory = RotationTheory | {
  id:string; system:string; name:string; definition:string; causes:string[]; mechanism:string;
  presentation:string[]; investigations:string[]; management:string[]; complications:string[]; viva:string;
};

const norm=(v:string)=>v.toLowerCase()
  .replace(/pulmonary tuberculosis/g,"tuberculosis").replace(/acute kidney injury/g,"aki")
  .replace(/chronic kidney disease/g,"ckd").replace(/ischaemic heart disease/g,"acute coronary syndrome")
  .replace(/venous thromboembolism.*pulmonary embolism/g,"pulmonary embolism")
  .replace(/&/g," and ").replace(/[^a-z0-9]+/g," ").trim();

function rotationFor(outline: CourseOutline) {
  const id=outline.id.toLowerCase();
  if(id.includes("internal-medicine")) return "medicine";
  if(id.includes("obstetrics")) return "obgyn";
  if(id.includes("paediatrics")) return "paeds";
  if(id.includes("psychiatry")) return "psychiatry";
  if(id.includes("surgery")) return "surgery";
  return null;
}

function score(topic:string,name:string){
  const a=norm(topic), b=norm(name);
  if(!a||!b) return 0;
  if(a===b) return 100;
  if(a.includes(b)||b.includes(a)) return Math.min(a.length,b.length);
  const aw=new Set(a.split(" ").filter(x=>x.length>2)), bw=new Set(b.split(" ").filter(x=>x.length>2));
  let n=0; aw.forEach(w=>{if(bw.has(w)) n++});
  return n>=2?n:0;
}

function findTheory(outline:CourseOutline,item:OutlineItem): Theory|null {
  const rotation=rotationFor(outline);
  const pool:Theory[] = rotation==="medicine"
    ? [...IMED_DISEASE_THEORY, ...YEAR4_ROTATION_THEORY.filter(x=>x.rotation==="medicine")]
    : YEAR4_ROTATION_THEORY.filter(x=>x.rotation===rotation);
  let best:Theory|null=null, bestScore=0;
  for(const t of pool){const s=score(item.title,t.name); if(s>bestScore){best=t;bestScore=s;}}
  return bestScore>=2?best:null;
}

function List({title,items}:{title:string;items:string[]}){
  if(!items.length)return null;
  return <div><h5 className="text-xs font-bold uppercase tracking-wide text-foreground">{title}</h5>
    <ul className="mt-1.5 space-y-1 text-sm text-muted-foreground">{items.map((x,i)=><li key={i} className="flex gap-2"><span className="text-primary">•</span><span>{x}</span></li>)}</ul></div>;
}

function TheoryBody({theory}:{theory:Theory}){
  const imed="causes" in theory;
  return <div className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
    <div className="sm:col-span-2"><h5 className="text-xs font-bold uppercase tracking-wide text-primary">Definition</h5><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{theory.definition}</p></div>
    {imed ? <>
      <List title="Causes / risk factors" items={theory.causes}/>
      <div><h5 className="text-xs font-bold uppercase tracking-wide text-foreground">Pathophysiology</h5><p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{theory.mechanism}</p></div>
      <List title="Clinical features" items={theory.presentation}/>
    </> : <>
      <List title="Core theory / mechanism" items={theory.core}/>
      <List title="Clinical features" items={theory.clinical}/>
    </>}
    <List title="Investigations" items={theory.investigations}/>
    <List title="Management principles" items={theory.management}/>
    <List title="Complications" items={theory.complications}/>
    <div className="sm:col-span-2 rounded-lg bg-primary/5 p-3"><p className="text-xs font-bold uppercase tracking-wide text-primary">Ward-round / viva pearl</p><p className="mt-1 text-sm text-foreground">{theory.viva}</p></div>
  </div>;
}

export default function Year4CurriculumNotes({outline}:{outline:CourseOutline}){
  const total=outline.sections.reduce((n,s)=>n+s.items.length,0);
  const connected=outline.sections.reduce((n,s)=>n+s.items.filter(i=>findTheory(outline,i)).length,0);
  return <div className="space-y-4">
    <section className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-primary">Course-outline learning path</p>
      <h2 className="mt-1 font-serif text-xl font-bold text-foreground">{outline.title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{outline.summary}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
        <span className="rounded-full bg-background px-2.5 py-1">{outline.sections.length} sections</span>
        <span className="rounded-full bg-background px-2.5 py-1">{total} outline topics</span>
        <span className="rounded-full bg-background px-2.5 py-1">{connected} topics with connected revision notes</span>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Study in order. Open a topic to connect the course outline to theory, clinical features, investigations, management, complications and viva reasoning.</p>
    </section>

    {outline.sections.map((section,si)=><section key={section.id} className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Section {si+1}</p>
        <h3 className="mt-0.5 font-serif text-lg font-bold text-foreground">{section.title}</h3>
        {section.note&&<p className="mt-1 text-xs text-muted-foreground">{section.note}</p>}
      </div>
      <div className="divide-y divide-border">
        {section.items.map((item,ii)=>{const theory=findTheory(outline,item); return <details key={item.id} className="group px-4 py-1 sm:px-5">
          <summary className="flex cursor-pointer list-none items-center gap-3 py-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">{ii+1}</span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-foreground">{item.title}</span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">{item.week||"Course topic"}{theory?" · Connected note":" · Outline topic — full note being built"}</span></span>
            {theory?<Stethoscope className="h-4 w-4 shrink-0 text-primary"/>:<BookOpen className="h-4 w-4 shrink-0 text-muted-foreground"/>}
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"/>
          </summary>
          <div className="pb-4 pl-10">
            {item.detail&&<p className="text-sm leading-relaxed text-muted-foreground">{item.detail}</p>}
            {theory?<TheoryBody theory={theory}/>:<p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">This topic is in the official course sequence. Its full interconnected note has not been written yet; keeping it visible prevents gaps in the curriculum.</p>}
          </div>
        </details>})}
      </div>
    </section>)}
  </div>;
}
