// Clinical topic taxonomy and required section sets.
export const TOPIC_TYPES = ["condition","emergency","injury/toxicology","drug","procedure","investigation","anatomy","physiology","public-health"];
const CORE = [
 ["definition","Definition and synonyms",45],
 ["classification","Types and recognised classification",35],
 ["epidemiology","Global and East African/Kenyan epidemiology",45],
 ["aetiology","Aetiology and risk factors",55],
 ["pathophysiology","Pathophysiology, step by step",75],
 ["clinical-features","Clinical features, timeline and special populations",70],
 ["differentials","Differential diagnosis and distinguishing features",55],
 ["investigations","Investigations and low-resource alternatives",70],
 ["immediate-management","Immediate management: ABC and numbered steps",70],
 ["definitive-management","Definitive management, drugs and low-resource adaptations",70],
 ["complications","Early and late complications, prognosis",45],
 ["prevention","Prevention and public-health measures",40],
 ["forensic","Medico-legal and forensic features where relevant",35],
 ["guidelines","Recent guideline recommendations",40],
 ["exam-pearls","Mnemonics and high-yield exam pearls",40],
 ["examiner-questions","Examiner questions with model answers",100],
 ["mcqs","MCQs with explained distractors",100],
 ["pitfalls","Common mistakes and misleading results",45],
 ["case-vignette","Clinical case with worked answer",60],
 ["related-topics","Related topics",12],
 ["references","References and guideline years",20]
];
const OTHER = {
 drug: [["definition","Drug identity, class and formulations",45],["mechanism","Mechanism of action",65],["pharmacokinetics","Pharmacokinetics",55],["indications","Indications and place in therapy",55],["dosing","Dosing principles and monitoring",55],["contraindications","Contraindications and interactions",60],["adverse-effects","Adverse effects and toxicity",60],["special-populations","Pregnancy, paediatrics, elderly and organ impairment",55],["administration","Preparation and administration safety",45],["guidelines","Guidelines and formulary context",35],["exam-pearls","Exam pearls",40],["examiner-questions","Examiner questions with answers",80],["mcqs","MCQs with explanations",80],["pitfalls","Prescribing pitfalls",40],["case-vignette","Clinical prescribing case",50],["related-topics","Related topics",12],["references","References",20]],
 procedure: [["definition","Definition and indications",45],["anatomy","Relevant anatomy and physiology",55],["indications","Indications and contraindications",55],["preparation","Preparation, consent and equipment",55],["technique","Step-by-step technique",90],["asepsis","Asepsis and patient safety",45],["aftercare","Aftercare and documentation",55],["complications","Complications and management",55],["alternatives","Alternatives and low-resource adaptations",45],["guidelines","Guidelines and standards",35],["exam-pearls","Exam pearls",40],["examiner-questions","Examiner questions with answers",80],["mcqs","MCQs with explanations",80],["pitfalls","Common errors",40],["case-vignette","Clinical case",50],["related-topics","Related topics",12],["references","References",20]],
 investigation: [["definition","Definition and purpose",45],["indications","Indications and clinical questions",50],["preparation","Patient preparation and sampling",50],["method","Method and specimen handling",65],["interpretation","Interpretation and normal ranges",80],["limitations","Limitations and confounders",60],["alternatives","Low-resource alternatives",45],["clinical-use","Clinical decision-making",55],["safety","Safety and quality assurance",40],["guidelines","Guidelines",35],["exam-pearls","Exam pearls",40],["examiner-questions","Examiner questions with answers",80],["mcqs","MCQs with explanations",80],["pitfalls","Common mistakes",40],["case-vignette","Worked interpretation case",50],["related-topics","Related topics",12],["references","References",20]],
 anatomy: [["definition","Definition and terminology",40],["development","Development and embryology",45],["structure","Gross anatomy and structure",65],["relations","Relations and surface landmarks",55],["blood-supply","Blood supply and lymphatics",50],["innervation","Innervation",45],["function","Function",50],["clinical","Clinical and applied anatomy",60],["imaging","Imaging and examination",45],["exam-pearls","Exam pearls",40],["examiner-questions","Examiner questions with answers",70],["mcqs","MCQs with explanations",70],["pitfalls","Common confusions",35],["case-vignette","Clinical application",40],["related-topics","Related topics",12],["references","References",15]],
 physiology: [["definition","Definition and concepts",40],["normal-process","Normal physiology step by step",75],["regulation","Regulation and feedback",60],["determinants","Determinants and normal ranges",55],["pathophysiology","Pathophysiological mechanisms",60],["clinical","Clinical relevance",55],["investigations","Physiological investigations",50],["special-contexts","Special contexts",40],["exam-pearls","Exam pearls",40],["examiner-questions","Examiner questions with answers",70],["mcqs","MCQs with explanations",70],["pitfalls","Common misconceptions",35],["case-vignette","Applied clinical case",40],["related-topics","Related topics",12],["references","References",15]],
 "public-health": [["definition","Definition and scope",45],["burden","Global, East African and Kenyan burden",60],["determinants","Social and health-system determinants",55],["surveillance","Surveillance and screening",55],["prevention","Primary, secondary and tertiary prevention",60],["interventions","Evidence-based interventions",65],["policy","Policy, ethics and equity",55],["evaluation","Monitoring and evaluation",50],["low-resource","Kenyan implementation considerations",50],["guidelines","Guidelines and policy documents",35],["exam-pearls","Exam pearls",40],["examiner-questions","Examiner questions with answers",70],["mcqs","MCQs with explanations",70],["pitfalls","Data limitations and common errors",35],["case-vignette","Public-health case",40],["related-topics","Related topics",12],["references","References",15]]
};
const SCHEMAS = {condition:CORE, emergency:CORE, "injury/toxicology":CORE, ...OTHER};
export function classifyTopic(name="", category="", hint="") {
 const s=(name+" "+category+" "+hint).toLowerCase();
 if (/asphyxi|cardiac arrest|anaphylaxis|shock|status epilepticus|cord prolapse|eclampsia|haemorrhage|hemorrhage|drowning|choking/.test(s)) return "emergency";
 if (/poison|toxic|envenom|snake bite|burn|trauma|injury|fracture|hanging|strangulation|carbon monoxide|cyanide|hydrogen sulfide/.test(s)) return "injury/toxicology";
 if (/pharmacology|antibiotic|analgesic|anticoagulant|insulin|metformin|adrenaline|epinephrine|terbutaline|magnesium sulfate|oxytocin|drug/.test(s)) return "drug";
 if (/procedure|operation|surgery|catheter|intubation|lumbar puncture|caesarean|cesarean|episiotomy|suturing|incision/.test(s)) return "procedure";
 if (/investigation|ecg|electrocardiogram|ultrasound|x-ray|radiograph|ct scan|mri|blood gas|capnography|spirometry|urinalysis/.test(s)) return "investigation";
 if (/anatomy|artery|vein|nerve|muscle|bone|embryology|histology/.test(s)) return "anatomy";
 if (/physiology|homeostasis|acid-base|gas exchange|ventilation|perfusion/.test(s)) return "physiology";
 if (/public health|epidemiology|health promotion|screening programme|surveillance|health policy|maternal mortality/.test(s)) return "public-health";
 return "condition";
}
export function schemaForType(type) {
 return (SCHEMAS[type] || CORE).map(([key, heading, minWords]) => ({key, heading, minWords}));
}
export function buildTopicPrompt({name, category="", context="", type=classifyTopic(name,category)}) {
 const schema=schemaForType(type);
 const defs=schema.map(x=>'{"key":"'+x.key+'","heading":"'+x.heading+'","applicable":true,"confidence":"high|medium|low","content":{"p":"paragraph","b":[],"t":[],"images":[]}}').join(",");
 let special="";
 if (/asphyxi/i.test(name)) special="Asphyxiation must cover mechanical airway obstruction, traumatic/compressive, perinatal, positional and chemical asphyxia (carbon monoxide, cyanide, hydrogen sulphide), drowning, hanging/strangulation, opioid respiratory depression and anaphylaxis. Explain adult/child/infant choking algorithms and correct back-blows then abdominal thrusts where indicated by current guidance. Do not invent timing. Low ETCO2 may reflect low pulmonary blood flow, increased dead space or hyperventilation; hypoventilation generally raises ETCO2 when perfusion and sampling are adequate. Include forensic findings and limitations.";
 if (/umbilical cord prolapse/i.test(name)) special="Umbilical cord prolapse must distinguish cord presentation from overt and occult prolapse; state incidence only with evidence or say not well documented; explain timing after membrane rupture and all recognised risk factors; describe manual elevation of presenting part, knee-chest or left lateral head-down, bladder filling where appropriate, avoid unnecessary cord handling or replacement, tocolysis such as terbutaline only when indicated and with guideline citation, urgency and decision-to-delivery target based on fetal status/local guidance, and outcomes only when sourced.";
 return "You are the senior clinical editor for OmpathStudy, an MBChB-level medical library. Teach first principles in plain language before technical terms. Topic: "+name+". Category: "+(category||"Medicine")+". Type: "+type+". Focus on Kenya/East Africa where known; unknown figures must say 'not well documented'. Return ONLY JSON with medical,title,subject,topicType,summary,aka,sections,faq,exam,mcqs,related,references. Each MCQ has exactly four options, one correct index, and four explanations (one for the correct option and why each distractor is wrong). Sections must be all of these in order: "+JSON.stringify(schema)+". Each section object has key, heading, applicable, confidence (high|medium|low), content {p,b,t,images}. If a recognised classification does not exist, mark that section applicable:false; never invent stages. Every applicable section must meet its minimum word count shown above, with explanation rather than one-line bullets. Complete sentences only; no orphan fragments. Never invent doses, classifications, statistics, guideline recommendations, references or URLs. Dose only when certain and cite the exact current guideline; otherwise name drug without dose. Explain pathophysiology stepwise, common versus less common causes, timeline and special populations, differentials, investigations and result meaning, low-resource alternatives, immediate ABC and definitive management, complications, prevention, relevant forensic findings, recent guideline changes, exam pearls, full MBChB model answers, MCQs with four options and why each distractor is wrong, pitfalls and worked case. Images must be [] unless an actual verified relevant URL is supplied. References must identify body, document and year when known. "+special+" Context: "+String(context||"").slice(0,2200)+". Educational material, not a substitute for local protocols or senior review.";
}
export function parseTopicJson(input) {
 const s=String(input||"").replace(/^\s*\x60\x60\x60(?:json)?/i,"").replace(/\x60\x60\x60\s*$/,"").trim();
 const start=s.indexOf("{"); if(start<0)return null;
 let depth=0,quote=false,escape=false;
 for(let i=start;i<s.length;i++){const c=s[i];if(quote){if(escape)escape=false;else if(c==="\\")escape=true;else if(c==='"')quote=false;continue;}if(c==='"')quote=true;else if(c==="{")depth++;else if(c==="}"&&--depth===0){try{return JSON.parse(s.slice(start,i+1));}catch{return null;}}}
 return null;
}
export function isCompleteText(value) {
 const s=String(value||"").trim();
 return !!s && !/^[,;:.!?)]/.test(s) && !/(?:[,;:]|\b(?:and|or|with|because|including|such as)\s*)$/i.test(s) && /[.!?)]$/.test(s);
}
export function sectionWordCount(section) {
 const c=section.content||section;
 return [c.p,...(c.b||[]),...(c.t||[]).flatMap(r=>[r.a,r.b])].filter(Boolean).join(" ").trim().split(/\s+/).filter(Boolean).length;
}
export function normalizeTopicPage(raw, meta={}) {
 if(!raw||typeof raw!=="object"||raw.medical===false)return {medical:false};
 const type=SCHEMAS[raw.topicType]?raw.topicType:classifyTopic(meta.name,meta.category);
 const schema=schemaForType(type), rows=Array.isArray(raw.sections)?raw.sections:[];
 const sections=schema.map(spec=>{
  const src=rows.find(x=>x.key===spec.key)||rows.find(x=>(x.heading||x.h)===spec.heading)||{};
  const c=src.content&&typeof src.content==="object"?src.content:src;
  const p=String(c.p||"").trim(), b=(Array.isArray(c.b)?c.b:[]).map(String).map(x=>x.trim()).filter(Boolean);
  const t=(Array.isArray(c.t)?c.t:[]).map(x=>({a:String(x.a||"").trim(),b:String(x.b||"").trim()})).filter(x=>x.a&&x.b);
  const images=[];
  const applicable=src.applicable!==false;
  return {key:spec.key,h:spec.heading,heading:spec.heading,applicable,confidence:["high","medium","low"].includes(src.confidence)?src.confidence:"low",content:applicable?{p,b,t,images}:{p:"",b:[],t:[],images:[]},p,b,t,images};
 });
 const faq=(Array.isArray(raw.faq)?raw.faq:[]).map(x=>({q:String(x.q||x.question||"").trim(),a:String(x.a||x.answer||"").trim()})).filter(x=>x.q.length>7&&x.a.length>10).slice(0,12);
 const exam=(Array.isArray(raw.exam)?raw.exam:[]).map(x=>typeof x==="string"?{q:x.split(" — ")[0],a:x.split(" — ").slice(1).join(" — ")}:{q:String(x.q||""),a:String(x.a||"")}).filter(x=>x.q.length>7&&x.a.length>10).slice(0,20);
 const mcqs=(Array.isArray(raw.mcqs)?raw.mcqs:[]).map(x=>({q:String(x.q||"").trim(),options:Array.isArray(x.options)?x.options.map(String).slice(0,4):Array.isArray(x.o)?x.o.map(String).slice(0,4):[],correct:Number.isInteger(x.correct)?x.correct:Number(x.a),explanations:Array.isArray(x.explanations)?x.explanations.map(String).slice(0,4):[]})).filter(x=>x.q.length>12&&x.options.length===4&&x.correct>=0&&x.correct<4&&x.explanations.length===4).slice(0,12);
 const references=(Array.isArray(raw.references)?raw.references:[]).map(x=>({body:String(x.body||""),title:String(x.title||""),year:Number(x.year)||null,url:""})).filter(x=>x.body||x.title).slice(0,20);
 return {medical:true,title:String(raw.title||meta.name||"").slice(0,100),subject:String(raw.subject||meta.category||"Medicine").slice(0,60),topicType:type,summary:String(raw.summary||"").trim(),aka:raw.aka||[],sections,faq,exam,mcqs,related:raw.related||[],references,model:meta.model||raw.model||"",generatedAt:new Date().toISOString().slice(0,10),reviewStatus:"pending"};
}
export function validateTopicPage(page) {
 const errors=[], schema=schemaForType(page.topicType);
 if(!isCompleteText(page.summary))errors.push({section:"summary",reason:"incomplete_sentence"});
 for(const s of page.sections||[]){if(!s.applicable)continue;const spec=schema.find(x=>x.key===s.key),c=s.content||s,parts=[c.p,...(c.b||[]),...(c.t||[]).flatMap(x=>[x.a,x.b])].filter(Boolean);if(!parts.length)errors.push({section:s.key,reason:"empty"});for(const p of parts)if(!isCompleteText(p))errors.push({section:s.key,reason:"incomplete_sentence"});const count=sectionWordCount(s);if(count<(spec?.minWords||30))errors.push({section:s.key,reason:"below_minimum",minimum:spec?.minWords||30,actual:count});}
 for(const x of schema)if(!(page.sections||[]).some(s=>s.key===x.key))errors.push({section:x.key,reason:"missing"});
 if((page.faq||[]).length<3)errors.push({section:"faq",reason:"missing_or_thin"});
 if((page.exam||[]).length<6)errors.push({section:"examiner-questions",reason:"missing_or_thin"});
 if((page.mcqs||[]).length<4)errors.push({section:"mcqs",reason:"missing_or_thin"});
 return errors;
}
export function topicRepairPrompt(name,type,sections,errors) {
 return "Repair affected sections and any missing FAQ, examiner answers or MCQs for "+name+" ("+type+"). Return ONLY JSON {sections:[{key,applicable,confidence,content:{p,b,t,images}}],faq:[],exam:[],mcqs:[]}. Errors: "+JSON.stringify(errors)+". Existing sections: "+JSON.stringify(sections)+". Meet minimum word counts, complete all sentences, preserve correct facts, never invent doses, classifications, statistics, guideline claims or image URLs.";
}
