import { useEffect } from "react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowRight, ArrowUpRight, BarChart3, BookOpen, Building2, CheckCircle2,
  ClipboardList, FileCheck2, FlaskConical, GraduationCap, Library, MessageCircle,
  Microscope, Presentation, ShieldCheck, Users,
} from "lucide-react";
import { updateMetaTags, SITE_URL } from "@/lib/seo";

const universities = [
  { name: "Mount Kenya University", short: "MKU", slug: "mku", note: "Research learning and support for MKU students." },
  { name: "University of Nairobi", short: "UoN", slug: "university-of-nairobi", note: "Research learning and support for University of Nairobi students." },
  { name: "Jomo Kenyatta University of Agriculture and Technology", short: "JKUAT", slug: "jkuat", note: "Research learning and support for JKUAT students." },
  { name: "Kenyatta University", short: "KU", slug: "kenyatta-university", note: "Research learning and support for Kenyatta University students." },
  { name: "Moi University", short: "Moi", slug: "moi-university", note: "Research learning and support for Moi University students." },
  { name: "Maseno University", short: "Maseno", slug: "maseno-university", note: "Research learning and support for Maseno University students." },
  { name: "Aga Khan University", short: "AKU", slug: "aga-khan-university", note: "Research learning and support for Aga Khan University students." },
  { name: "Other Kenyan universities", short: "Other", slug: "other-universities", note: "Tell us your institution so we can understand its requirements." },
];

const services = [
  { slug: "research-topic-consultation", title: "Research topic consultation", desc: "Refine a broad interest into a focused, feasible and ethically appropriate research question.", icon: Microscope, includes: ["Topic feasibility discussion", "Research question refinement", "Objectives and variables review", "Suggested study designs to discuss with your supervisor"] },
  { slug: "proposal-review", title: "Proposal review and editing", desc: "Get structured feedback on clarity, organisation, methodology and academic presentation while retaining authorship.", icon: FileCheck2, includes: ["Structure and coherence review", "Objectives and methods alignment", "Language and formatting edits", "Supervisor-feedback action list"] },
  { slug: "methodology-support", title: "Research methodology support", desc: "Understand and strengthen the methods behind your study, from design and sampling to measurement and bias.", icon: ClipboardList, includes: ["Study design consultation", "Target population and eligibility criteria", "Sampling approach and sample-size concepts", "Variables, operational definitions and data collection plan"] },
  { slug: "questionnaire-development", title: "Questionnaire and tool review", desc: "Develop or review data-collection instruments that are clear, relevant and aligned with your objectives.", icon: ClipboardList, includes: ["Question wording and response options", "Objective-to-question mapping", "Content and flow review", "Pilot-testing considerations"] },
  { slug: "data-analysis-support", title: "Data analysis support", desc: "Learn how to prepare, analyse and interpret your own research data using appropriate statistical methods.", icon: BarChart3, includes: ["Data cleaning guidance", "Descriptive and inferential statistics", "Tables and visualisations", "Interpretation of findings and limitations"] },
  { slug: "spss-support", title: "SPSS and statistical software support", desc: "Practical guidance for setting up variables, running appropriate analyses and understanding output.", icon: BarChart3, includes: ["Variable and value coding", "Descriptive statistics", "Common statistical tests", "Reading and explaining output"] },
  { slug: "academic-editing", title: "Academic editing and referencing", desc: "Improve readability, consistency, citation style and presentation without changing the meaning of your work.", icon: BookOpen, includes: ["Grammar and clarity edits", "Referencing consistency", "Tables, figures and headings", "Formatting against supplied guidelines"] },
  { slug: "research-defence-preparation", title: "Research defence preparation", desc: "Build confidence explaining your own research, methods, findings and limitations.", icon: Presentation, includes: ["Presentation structure", "Slide design guidance", "Likely examiner questions", "Practice explaining methods and results"] },
];

const resourceTopics = [
  "How to write a research problem statement",
  "Research objectives, questions and hypotheses",
  "Choosing a quantitative, qualitative or mixed-methods design",
  "Cross-sectional, cohort and case-control studies",
  "Sampling methods and sample-size concepts",
  "Validity, reliability and questionnaire piloting",
  "Descriptive statistics and confidence intervals",
  "Choosing and interpreting common statistical tests",
  "Research ethics, informed consent and confidentiality",
  "Writing and presenting research findings",
];

function slugLabel(value: string) {
  return value.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function ActionLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link to={to} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90">{children}<ArrowRight className="h-4 w-4" /></Link>;
}

function SectionTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{eyebrow}</p><h2 className="mt-2 font-serif text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h2><p className="mt-3 text-sm leading-7 text-muted-foreground sm:text-base">{description}</p></div>;
}

export default function ResearchHub() {
  const location = useLocation();
  const parts = location.pathname.split("/").filter(Boolean);
  const section = parts[1] || "";
  const slug = parts[2] || "";
  const service = section === "services" ? services.find((item) => item.slug === slug) : undefined;
  const university = section === "universities" ? universities.find((item) => item.slug === slug) : undefined;
  const isHome = !section;
  const isServices = section === "services" && !slug;
  const isUniversities = section === "universities" && !slug;
  const isTopics = section === "topics";
  const isResources = section === "resources";
  const isPricing = section === "pricing";
  const isIntegrity = section === "academic-integrity";
  const pageTitle = service?.title || university?.name || (isHome ? "Research Hub for University Students in Kenya" : isServices ? "Research Support Services" : isUniversities ? "University Research Support Directory" : isTopics ? "Research Topics and Ideas" : isResources ? "Research Learning Resources" : isPricing ? "Research Support Pricing" : isIntegrity ? "Academic Integrity and Responsible Research" : "Research Hub");
  const description = service?.desc || university?.note || (isHome ? "Practical research education, methodology guidance, statistical analysis support and academic editing for university students in Kenya." : isServices ? "Explore research methodology, proposal review, questionnaire, statistical analysis, editing and defence-preparation support." : isUniversities ? "Find research learning and support information for students at universities across Kenya." : isTopics ? "Explore research topic areas and learn how to turn an interest into a focused, feasible research question." : isResources ? "Accessible guides to research methods, sampling, statistics, ethics and academic writing." : isPricing ? "Understand how OmpathStudy Research Hub scopes and prices research education and support services." : "Our research support is designed to strengthen student understanding, transparency, responsible conduct and independent academic work.");
  const canonical = `${SITE_URL}${location.pathname}`;

  useEffect(() => {
    updateMetaTags({
      title: `${pageTitle} | OmpathStudy Research Hub`,
      description,
      url: canonical,
      keywords: ["research support Kenya", "undergraduate research Kenya", "research methodology", "medical student research", "research proposal guidance", "SPSS support Kenya", "OmpathStudy Research Hub"],
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: pageTitle,
        description,
        url: canonical,
        isPartOf: { "@type": "WebSite", name: "OmpathStudy", url: SITE_URL },
      },
    });

    // University pages remain crawlable through links but are not indexed until
    // institution-specific requirements have been researched and verified.
    let robots = document.querySelector('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement("meta");
      robots.setAttribute("name", "robots");
      document.head.appendChild(robots);
    }
    robots.setAttribute("content", university ? "noindex,follow" : "index,follow");
  }, [pageTitle, description, canonical, university]);

  return (
    <main className="min-h-dvh bg-background">
      <section className="relative overflow-hidden border-b border-border bg-[hsl(174,62%,18%)] text-white">
        <div className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-teal-300/10 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-5 py-12 sm:py-16 lg:py-20">
          <div className="mb-5 flex flex-wrap items-center gap-2 text-xs text-white/65"><Link to="/" className="hover:text-white">OmpathStudy</Link><span>/</span><Link to="/research" className="hover:text-white">Research Hub</Link>{section && <><span>/</span><span className="text-white/90">{pageTitle}</span></>}</div>
          <div className="grid gap-9 lg:grid-cols-[1.15fr_.85fr] lg:items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/80"><FlaskConical className="h-3.5 w-3.5" /> OmpathStudy Research Hub</span>
              <h1 className="mt-5 max-w-3xl font-serif text-3xl font-bold leading-tight tracking-tight sm:text-5xl">{isHome ? <>Research support that helps you <span className="text-teal-200">understand your work.</span></> : pageTitle}</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/75 sm:text-base">{isHome ? "Build confidence at every stage of your university research — from refining a question and planning a sound methodology to analysing your own data and preparing for your defence." : description}</p>
              <div className="mt-7 flex flex-wrap gap-3"><a href="https://wa.me/254115475543?text=Hello%20OmpathStudy%2C%20I%20would%20like%20to%20enquire%20about%20research%20support." target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-[hsl(174,62%,18%)] transition hover:bg-white/90"><MessageCircle className="h-4 w-4" /> Ask about research support</a><Link to="/research/services" className="inline-flex items-center gap-2 rounded-xl border border-white/25 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10">Explore services <ArrowRight className="h-4 w-4" /></Link></div>
              <p className="mt-4 text-xs text-white/55">For students across Kenyan universities · Starting with health-science research</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/[0.07] p-5 backdrop-blur-sm sm:p-6">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/60">Research support pathway</p>
              <div className="mt-5 space-y-4">
                {[
                  ["01", "Plan", "Question, objectives and study design"],
                  ["02", "Prepare", "Methods, tools and ethics awareness"],
                  ["03", "Analyse", "Data quality, statistics and interpretation"],
                  ["04", "Present", "Writing, editing and research defence"],
                ].map(([number, title, text]) => <div key={number} className="flex gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-200/15 text-xs font-bold text-teal-100">{number}</span><div><p className="text-sm font-semibold text-white">{title}</p><p className="mt-0.5 text-xs leading-5 text-white/60">{text}</p></div></div>)}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-5 py-10 sm:py-14">
        {(isHome || isServices) && <>
          <SectionTitle eyebrow="How we can help" title="Support at each stage of your research" description="Choose a focused service based on the stage you have reached. Our role is to explain, review and strengthen your work — not to replace your learning or authorship." />
          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {services.map(({ slug: serviceSlug, title, desc, icon: Icon }) => <Link key={serviceSlug} to={`/research/services/${serviceSlug}`} className="group rounded-2xl border border-border bg-card p-5 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span><h3 className="mt-4 text-base font-bold text-foreground">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{desc}</p><span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">Explore support <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span></Link>)}
          </div>
        </>}

        {service && <div className="grid gap-8 lg:grid-cols-[1fr_320px]"><div><SectionTitle eyebrow="Research service" title={service.title} description={service.desc} /><h2 className="mt-8 text-lg font-bold text-foreground">What this support may include</h2><ul className="mt-4 space-y-3">{service.includes.map((item) => <li key={item} className="flex gap-3 text-sm leading-6 text-muted-foreground"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{item}</li>)}</ul><div className="mt-8 rounded-2xl border border-border bg-muted/30 p-5"><h2 className="font-semibold text-foreground">What we need from you</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Share your research stage, academic programme, university guidance and supervisor feedback (where applicable). We will clarify the scope before confirming a fee or timeline.</p></div></div><aside className="h-fit rounded-2xl border border-border bg-card p-5"><h2 className="font-serif text-xl font-bold text-foreground">Discuss your requirements</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Every project has a different scope. Request an assessment before committing to a service.</p><a href={`https://wa.me/254115475543?text=${encodeURIComponent(`Hello OmpathStudy, I am interested in ${service.title}. Please explain the process and pricing.`)}`} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"><MessageCircle className="h-4 w-4" /> Enquire on WhatsApp</a><p className="mt-3 text-xs leading-5 text-muted-foreground">No work begins until scope, responsibilities, price and delivery expectations are agreed.</p></aside></div>}

        {(isHome || isUniversities) && <section className="mt-14"><SectionTitle eyebrow="Across Kenya" title="Research learning for students at different universities" description="University requirements differ. We help students understand their institution's published guidance and encourage confirmation with the relevant department, supervisor and ethics committee."/><div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{universities.map((uni) => <Link key={uni.slug} to={`/research/universities/${uni.slug}`} className="group rounded-xl border border-border bg-card p-4 transition hover:border-primary/40 hover:shadow-sm"><div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wider text-primary">{uni.short}</span><ArrowUpRight className="h-4 w-4 text-muted-foreground transition group-hover:text-primary"/></div><h3 className="mt-3 text-sm font-bold text-foreground">{uni.name}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{uni.note}</p></Link>)}</div></section>}

        {university && <section><SectionTitle eyebrow="University research directory" title={university.name} description={`Research learning and support for students at ${university.name}. Institutional requirements can vary by school, programme and department; always use the latest official student and ethics guidance.`}/><div className="mt-7 grid gap-4 md:grid-cols-2"><div className="rounded-2xl border border-border bg-card p-5"><Building2 className="h-6 w-6 text-primary"/><h2 className="mt-3 font-bold text-foreground">Start with your university guidance</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Confirm the current proposal template, formatting rules, supervisor process, research timelines and ethics-review pathway with your department. We do not assume that one university's requirements apply to another.</p></div><div className="rounded-2xl border border-border bg-card p-5"><Users className="h-6 w-6 text-primary"/><h2 className="mt-3 font-bold text-foreground">Get help understanding your next step</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">We can help you interpret guidance, organise your research plan, review your methods and prepare questions for your supervisor.</p><a className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary" href={`https://wa.me/254115475543?text=${encodeURIComponent(`Hello, I study at ${university.name} and would like to enquire about research learning support.`)}`} target="_blank" rel="noopener noreferrer">Make an enquiry <ArrowRight className="h-4 w-4"/></a></div></div><p className="mt-6 text-sm text-muted-foreground">This directory page is an introduction, not an official university publication or a substitute for your institution's current research handbook.</p></section>}

        {(isHome || isTopics) && <section className="mt-14"><SectionTitle eyebrow="Topic development" title="Turn an area of interest into a researchable question" description="A useful research topic is focused, relevant, feasible with available time and resources, and ethically appropriate. Begin with a discipline or problem area, then refine it with your supervisor."/><div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{["Internal medicine and chronic diseases","Obstetrics and gynaecology","Paediatrics and child health","Surgery and perioperative care","Psychiatry and mental health","Community medicine and public health","Nursing and patient safety","Pharmacy and medicines use","Clinical medicine and diagnostics"].map((topic) => <div key={topic} className="rounded-xl border border-border bg-card p-4"><div className="flex items-center gap-2 text-primary"><Microscope className="h-4 w-4"/><span className="text-xs font-semibold uppercase tracking-wide">Topic area</span></div><h3 className="mt-2 text-sm font-semibold text-foreground">{topic}</h3></div>)}</div><div className="mt-5"><ActionLink to="/research/resources">Learn research fundamentals</ActionLink></div></section>}

        {(isHome || isResources) && <section className="mt-14"><SectionTitle eyebrow="Research library" title="Build your research skills" description="Practical learning resources should help you understand decisions and explain your work. The topics below form the foundation of our planned research learning library."/><div className="mt-6 grid gap-3 sm:grid-cols-2">{resourceTopics.map((topic, index) => <div key={topic} className="flex gap-3 rounded-xl border border-border bg-card p-4"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">{index + 1}</span><p className="text-sm font-medium leading-6 text-foreground">{topic}</p></div>)}</div></section>}

        {(isHome || isPricing) && <section className="mt-14 rounded-2xl border border-border bg-muted/30 p-6 sm:p-8"><SectionTitle eyebrow="Transparent pricing" title="Pay for the support you actually need" description="We are designing an affordable, service-by-service model for students. A clear quote will be provided after we understand the task, complexity, timeline and deliverables. We will not advertise a fixed price that cannot be delivered responsibly."/><div className="mt-6 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-border bg-card p-4"><p className="font-semibold text-foreground">Focused support</p><p className="mt-1 text-sm text-muted-foreground">A single consultation, review or learning session.</p></div><div className="rounded-xl border border-border bg-card p-4"><p className="font-semibold text-foreground">Stage-based support</p><p className="mt-1 text-sm text-muted-foreground">A defined set of tasks for one research stage.</p></div><div className="rounded-xl border border-border bg-card p-4"><p className="font-semibold text-foreground">Extended support</p><p className="mt-1 text-sm text-muted-foreground">A scoped series of sessions with clear milestones.</p></div></div></section>}

        {(isHome || isIntegrity) && <section className="mt-14"><div className="grid gap-6 rounded-2xl border border-emerald-700/20 bg-emerald-500/[0.05] p-6 sm:grid-cols-[auto_1fr] sm:p-8"><ShieldCheck className="h-8 w-8 text-emerald-700 dark:text-emerald-400"/><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-400">Our commitment</p><h2 className="mt-2 font-serif text-2xl font-bold text-foreground">Your research must remain your work.</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">We support learning, consultation, editing, responsible analysis and presentation preparation. We do not fabricate data, write assessed research for submission as someone else's work, impersonate students, guarantee ethics approval or bypass university rules. Students remain responsible for their research decisions, participant protections, data and final submissions.</p><Link to="/research/academic-integrity" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">Read our academic integrity principles <ArrowRight className="h-4 w-4"/></Link></div></div></section>}

        {isHome && <section className="mt-14 rounded-2xl bg-[hsl(174,62%,18%)] p-6 text-white sm:p-8"><div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-white/60">Start with a conversation</p><h2 className="mt-2 font-serif text-2xl font-bold">Tell us where you are in your research.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-white/70">Share your university, programme, research stage and the specific support you need. We will clarify the next step and scope before any commitment.</p></div><a href="https://wa.me/254115475543?text=Hello%20OmpathStudy%2C%20I%20would%20like%20to%20discuss%20my%20research." target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-[hsl(174,62%,18%)]"><MessageCircle className="h-4 w-4"/> Contact the team</a></div></section>}

        <section className="mt-14 border-t border-border pt-8"><div className="flex flex-wrap gap-x-5 gap-y-3 text-sm"><Link className="font-medium text-primary hover:underline" to="/research/services">All services</Link><Link className="font-medium text-primary hover:underline" to="/research/universities">Universities</Link><Link className="font-medium text-primary hover:underline" to="/research/topics">Research topics</Link><Link className="font-medium text-primary hover:underline" to="/research/resources">Learning resources</Link><Link className="font-medium text-primary hover:underline" to="/research/pricing">Pricing</Link><Link className="font-medium text-primary hover:underline" to="/research/academic-integrity">Academic integrity</Link></div></section>
      </div>
    </main>
  );
}
