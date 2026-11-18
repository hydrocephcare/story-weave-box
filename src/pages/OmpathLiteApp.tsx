import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, ExternalLink, HeartPulse, ShieldCheck, Stethoscope } from "lucide-react";
import "./ompath-lite.css";
import { detectEmergencyLanguage } from "../../shared/ompathLiteRedFlags.js";

type Assessment = {
  provisional_diagnosis: string;
  differential_diagnoses: string[];
  diagnostic_rationale: string;
  urgency_level: "emergency" | "urgent" | "prompt" | "routine" | "uncertain";
  reasons: string[];
  next_steps: string[];
  limitations: string[];
  recommended_evaluation: string[];
  concern_category: string;
  presenting_concern: string | null;
};
type Resource = { title: string; slug: string; summary: string; url: string };
type Choice = { value: string; label: string };
type Question = { id: string; label: string; options: Choice[]; hint?: string };

const API = "/api/ompath-lite-web";
const yesNoUnsure: Choice[] = [
  { value: "1", label: "Yes" },
  { value: "2", label: "No" },
  { value: "3", label: "Not sure" },
];
const duration: Choice[] = [
  { value: "1", label: "Today / less than 24 hours" },
  { value: "2", label: "1–7 days" },
  { value: "3", label: "More than 7 days" },
];
const categories = [
  ["Pregnancy-related concern", "Pregnancy and maternity symptoms"],
  ["Menstrual problem", "Periods, cycle changes or menstrual pain"],
  ["Lower abdominal pain", "Pain in the lower abdomen or pelvis"],
  ["Vaginal discharge", "Unusual vaginal discharge or odour"],
  ["Bleeding", "Unexpected or heavy bleeding"],
  ["Other health concern", "Another symptom or health concern"],
] as const;

function questionsFor(category: string, answers: Record<string, string>): Question[] {
  const emergency: Question = {
    id: "emergency_screen",
    label: "Are you experiencing any emergency warning sign right now?",
    hint: "Examples: severe difficulty breathing, chest pain, fainting, seizure, heavy bleeding or severe sudden pain.",
    options: yesNoUnsure,
  };
  if (answers.emergency_screen === "1") return [emergency];
  if (category === "Pregnancy-related concern") {
    const status: Question = { id: "pregnancy_status", label: "Is the pregnancy confirmed?", options: yesNoUnsure };
    if (!answers.pregnancy_status) return [emergency, status];
    const bleeding: Question = { id: "pregnancy_bleeding_or_fluid", label: "Are you having vaginal bleeding or leaking fluid?", options: yesNoUnsure };
    if (answers.pregnancy_status !== "1") return [emergency, status, bleeding];
    const gestation: Question = {
      id: "gestation", label: "How far along is the pregnancy?",
      options: [
        { value: "1", label: "Under 20 weeks" },
        { value: "2", label: "20–27 weeks" },
        { value: "3", label: "28 weeks or more" },
        { value: "4", label: "Not sure" },
      ],
    };
    if (!answers.gestation) return [emergency, status, gestation, bleeding];
    const movement: Question = { id: "pregnancy_movement", label: "If 20 weeks or more, are the baby's movements reduced or absent?", options: yesNoUnsure };
    return ["2", "3", "4"].includes(answers.gestation)
      ? [emergency, status, gestation, bleeding, movement]
      : [emergency, status, gestation, bleeding];
  }
  const fever: Question = { id: "fever", label: "Do you have fever or chills?", options: yesNoUnsure };
  const possiblePregnancy: Question = { id: "pregnancy_possibility", label: "Could you be pregnant, or have you recently given birth?", options: yesNoUnsure };
  const worsening: Question = { id: "severity", label: "Is the pain or symptom severe or getting worse?", options: yesNoUnsure };
  if (category === "Lower abdominal pain") return [
    emergency,
    { id: "onset", label: "When did the pain start?", options: duration },
    possiblePregnancy,
    { id: "fever_vomiting", label: "Do you have fever or repeated vomiting?", options: yesNoUnsure },
    worsening,
  ];
  if (category === "Bleeding") return [
    emergency,
    { id: "bleeding_amount", label: "Is the bleeding heavy (soaking about one pad per hour)?", options: yesNoUnsure },
    possiblePregnancy,
    { id: "faintness", label: "Have you felt faint or nearly passed out?", options: yesNoUnsure },
    { id: "pain", label: "Do you have severe abdominal or pelvic pain?", options: yesNoUnsure },
  ];
  if (category === "Vaginal discharge") return [
    emergency,
    { id: "duration", label: "How long have you had the discharge?", options: duration },
    fever,
    { id: "pregnancy_possibility", label: "Could you be pregnant?", options: yesNoUnsure },
    worsening,
  ];
  if (category === "Menstrual problem") return [
    emergency,
    { id: "duration", label: "How long has this menstrual problem been happening?", options: duration },
    fever,
    { id: "pregnancy_possibility", label: "Could you be pregnant?", options: yesNoUnsure },
    worsening,
  ];
  return [
    emergency,
    { id: "duration", label: "How long has this been happening?", options: duration },
    fever,
    { id: "worsening", label: "Are the symptoms getting worse?", options: yesNoUnsure },
    { id: "care", label: "Have you already received medical care for this problem?", options: yesNoUnsure },
  ];
}

function urgencyLabel(value: Assessment["urgency_level"]) {
  return ({
    emergency: "Emergency — seek care now",
    urgent: "Urgent — assessment today",
    prompt: "Arrange an in-person assessment",
    routine: "Routine follow-up",
    uncertain: "More assessment is needed",
  })[value] || "Assessment needed";
}

async function postAssessment(payload: Record<string, unknown>) {
  const response = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "health-assess", ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "We could not complete your health assessment. Please try again.");
  return data as { assessment: Assessment; resources: Resource[]; reference: string };
}

export default function OmpathLiteApp() {
  useEffect(() => {
    document.title = "OmpathStudy Lite | Health Support";
    const description = "OmpathStudy Lite provides symptom intake, emergency warning-sign screening and preliminary health guidance.";
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", description);
  }, []);
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ assessment: Assessment; resources: Resource[]; reference: string } | null>(null);
  const redFlagDetected = useMemo(() => detectEmergencyLanguage(description).length > 0, [description]);
  const questions = useMemo(() => {
    const pathway = questionsFor(category, answers);
    return redFlagDetected ? pathway.slice(0, 1) : pathway;
  }, [category, answers, redFlagDetected]);
  const answered = questions.filter((question) => Boolean(answers[question.id])).length;
  const emergencyReported = answers.emergency_screen === "1" || redFlagDetected;
  const canSubmit = Boolean(category && consent && answers.emergency_screen && (emergencyReported || (questions.length > 1 && questions.every((question) => Boolean(answers[question.id])))));

  const setAnswer = (id: string, value: string) => {
    setAnswers((current) => {
      const next = { ...current, [id]: value };
      if (id === "pregnancy_status" && value !== "1") {
        delete next.gestation;
        delete next.pregnancy_movement;
      }
      if (id === "gestation" && value === "1") delete next.pregnancy_movement;
      return next;
    });
  };

  const submit = async () => {
    if (!canSubmit || loading) return;
    setLoading(true);
    setError("");
    try {
      const orderedAnswers = questions
        .filter((question) => Boolean(answers[question.id]))
        .map((question) => ({ question_id: question.id, answer: answers[question.id] }));
      const data = await postAssessment({
        session_id: crypto.randomUUID(),
        concern_category: category,
        original_message: description.trim(),
        answers: orderedAnswers,
        consent_given: true,
      });
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The service is temporarily unavailable. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setCategory("");
    setDescription("");
    setAnswers({});
    setConsent(false);
    setError("");
    setResult(null);
  };

  return (
    <div className="health-shell">
      <header className="health-header">
        <a className="health-brand" href="/" aria-label="OmpathStudy Lite home">
          <span className="health-brand-mark">O<span>+</span></span>
          <span><strong>OMPATH<span> LITE</span></strong><small>HEALTH SUPPORT</small></span>
        </a>
        <a className="health-main-link" href="https://www.ompathstudy.com" target="_blank" rel="noreferrer">
          Main OmpathStudy <ExternalLink size={15} />
        </a>
      </header>

      <main className="health-main">
        {!result ? (
          <>
            <section className="health-hero">
              <div className="health-eyebrow"><HeartPulse size={15} /> HEALTH SUPPORT</div>
              <h1>Understand your symptoms.<br /><em>Know what to do next.</em></h1>
              <p>Describe what is troubling you. OmpathStudy Health Support will screen for warning signs, ask relevant questions and provide a preliminary assessment with safe next steps.</p>
              <div className="health-hero-note"><ShieldCheck size={18} /> Private intake · English · Designed for mobile and low-bandwidth access</div>
            </section>

            <section className="health-disclaimer">
              <AlertTriangle size={20} />
              <div><strong>Need emergency help?</strong><p>If you have severe difficulty breathing, chest pain, fainting, a seizure, severe bleeding, severe sudden pain or feel in immediate danger, go to the nearest emergency department now. Do not wait for an online response.</p></div>
            </section>
            <section className="health-panel">
              <div className="health-panel-heading">
                <div><span className="health-step">01</span><div><h2>Tell us what is happening</h2><p>Do not include your name or another person's identifying details.</p></div></div>
                <span className="health-required">Required fields *</span>
              </div>

              <label className="health-field">
                <span>Main concern *</span>
                <select value={category} onChange={(event) => { setCategory(event.target.value); setAnswers({}); setError(""); }}>
                  <option value="">Choose the closest match</option>
                  {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>

              <label className="health-field">
                <span>Describe your symptoms</span>
                <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1200} rows={4} placeholder="For example: I have lower abdominal pain that started yesterday, with fever..." />
                <small>{description.length}/1,200 characters. Include when it started and what makes it better or worse, if known.</small>
              </label>

              {redFlagDetected && <div className="health-error" role="alert"><AlertTriangle size={18} /> Your description includes a possible emergency warning sign. Seek emergency care now. Routine questions have been paused; do not wait for an online assessment.</div>}

              {category && (
                <div className="health-questions">
                  <div className="health-subheading"><span className="health-step">02</span><div><h2>Safety and follow-up questions</h2><p>Questions change according to the concern you selected.</p></div></div>
                  {questions.map((question, index) => (
                    <fieldset className="health-question" key={question.id}>
                      <legend><span>{index + 1}.</span> {question.label}</legend>
                      {question.hint && <p>{question.hint}</p>}
                      <div className="health-options">
                        {question.options.map((option) => (
                          <label key={option.value} className={answers[question.id] === option.value ? "selected" : ""}>
                            <input type="radio" name={question.id} value={option.value} checked={answers[question.id] === option.value} onChange={() => setAnswer(question.id, option.value)} />
                            <span>{option.label}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ))}
                  <div className="health-progress"><span style={{ width: questions.length ? (answered / questions.length * 100) + "%" : "0%" }} /></div>
                  <small className="health-progress-label">{answered} of {questions.length} questions answered</small>
                </div>
              )}

              <div className="health-contact">
                <div className="health-subheading"><span className="health-step">03</span><div><h2>Consent and privacy</h2><p>No name or phone number is required for this web assessment.</p></div></div>
                <label className="health-consent">
                  <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                  <span>I consent to OmpathStudy storing my health answers securely for up to 30 days to provide this service. I understand this is not emergency care or a confirmed diagnosis.</span>
                </label>
              </div>

              {error && <div className="health-error" role="alert"><AlertTriangle size={18} /> {error}</div>}
              <button className="health-submit" disabled={!canSubmit || loading} onClick={() => void submit()}>
                {loading ? "Preparing your assessment…" : "Submit for preliminary assessment"} <ArrowRight size={18} />
              </button>
              <p className="health-privacy"><ShieldCheck size={15} /> Your answers are not used to create a definitive diagnosis. Do not delay emergency care to complete this form.</p>
            </section>

          </>
        ) : (
          <section className="health-result">
            <div className="health-result-top"><div className="health-eyebrow"><CheckCircle2 size={15} /> ASSESSMENT COMPLETED</div><button className="health-reset" onClick={reset}>Start another enquiry</button></div>
            <h1>Your preliminary assessment</h1>
            <div className={"health-urgency " + result.assessment.urgency_level}>
              <AlertTriangle size={21} /><div><strong>{urgencyLabel(result.assessment.urgency_level)}</strong><p>{result.assessment.urgency_level === "emergency" ? "Seek emergency care immediately. Do not wait for further messages." : result.assessment.urgency_level === "urgent" ? "Please attend a health facility today for an in-person assessment." : "This assessment is limited. Arrange an in-person clinical review."}</p></div>
            </div>
            <article className="health-result-card">
              <span className="health-result-label"><Stethoscope size={16} /> PRELIMINARY CLINICAL IMPRESSION</span>
              <h2>{result.assessment.provisional_diagnosis}</h2>
              <p>{result.assessment.diagnostic_rationale}</p>
            </article>
            {result.assessment.differential_diagnoses?.length > 0 && <article className="health-result-card"><h2>Possible causes to consider</h2><ul>{result.assessment.differential_diagnoses.map((item) => <li key={item}>{item}</li>)}</ul></article>}
            {result.assessment.reasons?.length > 0 && <article className="health-result-card"><h2>Why this level of care was advised</h2><ul>{result.assessment.reasons.map((item) => <li key={item}>{item}</li>)}</ul></article>}
            <article className="health-result-card"><h2>Recommended next steps</h2><ul>{result.assessment.next_steps.map((item) => <li key={item}>{item}</li>)}</ul></article>
            <article className="health-result-card"><h2>What a clinician may need to assess</h2><ul>{result.assessment.recommended_evaluation.map((item) => <li key={item}>{item}</li>)}</ul></article>
            {result.resources.length > 0 && <article className="health-result-card"><h2>Reviewed OmpathStudy information</h2><p>These patient-facing resources have been reviewed for publication.</p>{result.resources.map((resource) => <a className="health-resource" key={resource.slug} href={resource.url} target="_blank" rel="noreferrer"><span><strong>{resource.title}</strong><small>{resource.summary}</small></span><ExternalLink size={16} /></a>)}</article>}
            <article className="health-limitations"><strong>Important limitations</strong><ul>{result.assessment.limitations.map((item) => <li key={item}>{item}</li>)}</ul><p>Reference: {result.reference}</p></article>
            <button className="health-submit" onClick={reset}>Finish <CheckCircle2 size={18} /></button>
          </section>
        )}
      </main>

      <footer className="health-footer">
        <div><strong>OmpathStudy Lite</strong><span>Focused health support by OmpathStudy.</span></div>
        <a href="https://www.ompathstudy.com" target="_blank" rel="noreferrer">For medical learning, visit the main OmpathStudy website <ArrowRight size={15} /></a>
        <small>Automated preliminary support is not a substitute for a qualified clinician, physical examination or investigations.</small>
      </footer>
    </div>
  );
}
