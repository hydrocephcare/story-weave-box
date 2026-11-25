import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ChevronRight, CircleHelp, GraduationCap, LogIn, LogOut, MessageSquare, Phone, ShieldCheck, Sparkles, Trophy, UserPlus, WifiOff } from "lucide-react";
import "./ompath-lite-learning.css";

type Student = { id: string; phone_number: string; full_name: string; study_level: string; sms_opt_in: boolean; parent_phone?: string | null; parent_sms_opt_in?: boolean; preferred_subject?: string | null; preferred_language?: string; school_name?: string | null };
type SetItem = { id: string; title: string; category: string; slug?: string };
type Question = { set_id: string; set_title: string; category: string; question_index: number; question: string; options: string[] };
type Progress = { total_attempts: number; correct: number; incorrect: number; accuracy: number };

const TOKEN_KEY = "ompath-lite-student-token";
const API = "/api/ompath-lite-learning";
async function callApi(action: string, payload: Record<string, unknown> = {}, token?: string) {
  const response = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { "x-student-token": token } : {}) },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "The service is temporarily unavailable.");
  return data;
}

export default function OmpathLiteLearningApp() {
  const [token, setToken] = useState(() => { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; } });
  const [student, setStudent] = useState<Student | null>(null);
  const [sets, setSets] = useState<SetItem[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [mode, setMode] = useState<"catalogue" | "quiz" | "progress">("catalogue");
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [form, setForm] = useState({ full_name: "", phone_number: "", study_level: "Year 1", pin: "", school_name: "", parent_phone: "", sms_opt_in: true, parent_sms_opt_in: false, preferred_language: "en" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [activeSet, setActiveSet] = useState<SetItem | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [questionCount, setQuestionCount] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ is_correct: boolean; correct_answer: number; explanation: string } | null>(null);
  const [answered, setAnswered] = useState(0);
  const [daily, setDaily] = useState(false);

  const filteredSets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sets.filter((item) => !q || (item.title + " " + item.category).toLowerCase().includes(q));
  }, [sets, search]);

  const refresh = useCallback(async (authToken: string) => {
    const [catalogue, stats] = await Promise.all([
      callApi("catalogue", {}, authToken),
      callApi("progress", {}, authToken),
    ]);
    setStudent(catalogue.student);
    setSets(catalogue.sets || []);
    setProgress(stats.progress);
  }, []);

  useEffect(() => {
    document.title = "OmpathStudy Lite | Medical learning on any phone";
    const description = "Study medical topics, practise MCQs and track progress through web, SMS and USSD with OmpathStudy Lite.";
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) { meta = document.createElement("meta"); meta.setAttribute("name", "description"); document.head.appendChild(meta); }
    meta.setAttribute("content", description);
    if (token) refresh(token).catch(() => { try { localStorage.removeItem(TOKEN_KEY); } catch {} setToken(""); setStudent(null); });
  }, [token, refresh]);

  const authenticate = async () => {
    setLoading(true); setError(""); setNotice("");
    try {
      const action = authMode === "register" ? "register" : "login";
      const payload = authMode === "register" ? form : { phone_number: form.phone_number, pin: form.pin };
      const result = await callApi(action, payload);
      setToken(result.token);
      try { localStorage.setItem(TOKEN_KEY, result.token); } catch {}
      setStudent(result.student);
      await refresh(result.token);
      setNotice(authMode === "register" ? "Your learner profile is ready. Start with the daily challenge." : "Welcome back. Your learning progress has been restored.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not sign you in."); }
    finally { setLoading(false); }
  };

  const signOut = () => {
    try { localStorage.removeItem(TOKEN_KEY); } catch {}
    setToken(""); setStudent(null); setSets([]); setProgress(null); setActiveSet(null); setQuestion(null); setMode("catalogue");
  };

  const openQuestion = async (set: SetItem, index = 0, isDaily = false) => {
    setLoading(true); setError(""); setNotice(""); setFeedback(null); setSelected(null);
    try {
      const result = await callApi("question", { set_id: set.id, question_index: index }, token);
      setActiveSet(set); setQuestion(result.question); setQuestionCount(result.total); setAnswered(index); setDaily(isDaily); setMode("quiz");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load this question set."); }
    finally { setLoading(false); }
  };

  const startDaily = async () => {
    setLoading(true); setError("");
    try {
      const result = await callApi("daily", {}, token);
      await openQuestion(result.set, 0, true);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not start the daily quiz."); setLoading(false); }
  };

  const submit = async () => {
    if (!question || selected === null || !activeSet || feedback) return;
    setLoading(true); setError("");
    try {
      const result = await callApi("submit", { set_id: activeSet.id, question_index: question.question_index, selected_option: selected + 1 }, token);
      setFeedback(result);
      setProgress((old) => old ? { ...old, total_attempts: old.total_attempts + 1, correct: old.correct + (result.is_correct ? 1 : 0), incorrect: old.incorrect + (result.is_correct ? 0 : 1), accuracy: Math.round(((old.correct + (result.is_correct ? 1 : 0)) / (old.total_attempts + 1)) * 100) } : old);
    } catch (e) { setError(e instanceof Error ? e.message : "Your answer could not be recorded."); }
    finally { setLoading(false); }
  };

  const nextQuestion = async () => {
    if (!activeSet || !question) return;
    const next = question.question_index + 1;
    if (daily && next >= 5) { setNotice("Daily challenge completed. Your answers have been added to your progress."); setMode("progress"); setFeedback(null); setQuestion(null); await refresh(token); return; }
    if (next >= questionCount) { setNotice("You have completed this question set."); setMode("catalogue"); setFeedback(null); setQuestion(null); await refresh(token); return; }
    await openQuestion(activeSet, next, daily);
  };

  const showProgress = async () => {
    setLoading(true); setError("");
    try { const result = await callApi("progress", {}, token); setProgress(result.progress); setMode("progress"); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load progress."); }
    finally { setLoading(false); }
  };

  return (
    <div className="lite-learn-shell">
      <header className="lite-learn-header">
        <a className="lite-learn-brand" href="/" aria-label="OmpathStudy Lite home">
          <span className="lite-learn-mark">O<span>+</span></span>
          <span><strong>OMPATH<span> LITE</span></strong><small>LEARN ANYWHERE</small></span>
        </a>
        <div className="lite-learn-header-actions">
          <a href="/health-support" className="lite-learn-text-link">Health support</a>
          {student ? <button className="lite-learn-quiet" onClick={signOut}><LogOut size={16} /> Sign out</button> : <span className="lite-learn-online"><WifiOff size={14} /> Low-data learning</span>}
        </div>
      </header>

      <main className="lite-learn-main">
        <section className="lite-learn-hero">
          <div className="lite-learn-kicker"><GraduationCap size={16} /> AFRICA'S TALKING · EDTECH</div>
          <h1>Medical learning.<br /><em>On any phone.</em></h1>
          <p>Practise medical MCQs, get daily learning prompts and follow your progress. Use the web when you have data, or continue through SMS and USSD when you do not.</p>
          <div className="lite-learn-pills"><span><BookOpen size={14} /> 1,000+ published MCQ sets</span><span><MessageSquare size={14} /> SMS learning</span><span><Phone size={14} /> USSD access</span></div>
        </section>

        <section className="lite-learn-feature-grid">
          <article><span className="lite-feature-icon"><Sparkles size={19} /></span><strong>Daily challenge</strong><p>A short, focused quiz matched to your study year.</p></article>
          <article><span className="lite-feature-icon"><WifiOff size={19} /></span><strong>Works beyond data</strong><p>Continue learning with USSD and SMS on basic phones.</p></article>
          <article><span className="lite-feature-icon"><Trophy size={19} /></span><strong>Track progress</strong><p>See attempts, accuracy and the work still ahead.</p></article>
        </section>

        {error && <div className="lite-learn-alert" role="alert">{error}</div>}
        {notice && <div className="lite-learn-notice" role="status">{notice}</div>}

        {!student ? (
          <section className="lite-learn-auth">
            <div className="lite-auth-intro"><span className="lite-learn-step">GET STARTED</span><h2>Your learning profile</h2><p>Register once to save your quiz attempts and receive learning messages you choose to receive.</p></div>
            <div className="lite-auth-tabs"><button className={authMode === "register" ? "active" : ""} onClick={() => setAuthMode("register")}><UserPlus size={16} /> Register</button><button className={authMode === "login" ? "active" : ""} onClick={() => setAuthMode("login")}><LogIn size={16} /> Sign in</button></div>
            <div className="lite-learn-form-grid">
              {authMode === "register" && <label>Full name<input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Your name" autoComplete="name" /></label>}
              <label>Mobile number<input value={form.phone_number} onChange={(e) => setForm({ ...form, phone_number: e.target.value })} placeholder="07XXXXXXXX or +254..." inputMode="tel" autoComplete="tel" /></label>
              {authMode === "register" && <label>Study year<select value={form.study_level} onChange={(e) => setForm({ ...form, study_level: e.target.value })}>{[1,2,3,4,5,6].map((n) => <option key={n} value={"Year " + n}>Year {n}</option>)}</select></label>}
              {authMode === "register" && <label>School / institution (optional)<input value={form.school_name} onChange={(e) => setForm({ ...form, school_name: e.target.value })} placeholder="Your institution" /></label>}
              {authMode === "register" && <label>Parent / guardian phone (optional)<input value={form.parent_phone} onChange={(e) => setForm({ ...form, parent_phone: e.target.value })} placeholder="07XXXXXXXX" inputMode="tel" /></label>}
              <label>Six-digit PIN<input value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 6) })} placeholder="6 digits" inputMode="numeric" type="password" autoComplete={authMode === "register" ? "new-password" : "current-password"} /></label>
            </div>
            {authMode === "register" && <div className="lite-learn-consents">
              <label><input type="checkbox" checked={form.sms_opt_in} onChange={(e) => setForm({ ...form, sms_opt_in: e.target.checked })} /> I agree to receive daily learning SMS. I can opt out by replying STOP.</label>
              <label><input type="checkbox" checked={form.parent_sms_opt_in} onChange={(e) => setForm({ ...form, parent_sms_opt_in: e.target.checked })} /> I have permission for learning updates to be sent to the parent / guardian number above.</label>
            </div>}
            <button className="lite-learn-primary" disabled={loading} onClick={() => void authenticate()}>{loading ? "Please wait…" : authMode === "register" ? "Create learner profile" : "Sign in and continue"} <ArrowRight size={17} /></button>
            <p className="lite-learn-security"><ShieldCheck size={15} /> Your PIN is stored as a secure hash. Your parent / guardian is contacted only with your explicit permission.</p>
          </section>
        ) : (
          <>
            <section className="lite-learn-welcome">
              <div><span className="lite-learn-step">YOUR LEARNING SPACE</span><h2>Welcome, {student.full_name.split(" ")[0]}.</h2><p>{student.study_level}{student.school_name ? " · " + student.school_name : ""}</p></div>
              <div className="lite-learn-nav"><button className={mode === "catalogue" ? "active" : ""} onClick={() => setMode("catalogue")}>Question bank</button><button className={mode === "progress" ? "active" : ""} onClick={() => void showProgress()}>My progress</button></div>
            </section>
            {mode === "catalogue" && (
              <>
                <section className="lite-daily-card"><div><span className="lite-learn-step">TODAY'S PRACTICE</span><h2>Five questions. One stronger day.</h2><p>A short daily challenge selected for {student.study_level}.</p></div><button onClick={() => void startDaily()} disabled={loading}>Start daily quiz <ArrowRight size={17} /></button></section>
                <section className="lite-catalogue"><div className="lite-catalogue-heading"><div><h2>Explore the question bank</h2><p>{sets.length} published question sets available</p></div><input aria-label="Search question bank" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search topics…" /></div>
                  <div className="lite-set-list">{filteredSets.map((item) => <button className="lite-set-row" key={item.id} onClick={() => void openQuestion(item)}><span className="lite-set-icon"><BookOpen size={18} /></span><span><strong>{item.title}</strong><small>{item.category}</small></span><ChevronRight size={18} /></button>)}</div>
                  {!filteredSets.length && <p className="lite-empty">No question sets match this search.</p>}
                </section>
              </>
            )}
            {mode === "quiz" && question && activeSet && (
              <section className="lite-quiz-card">
                <button className="lite-back-link" onClick={() => { setMode("catalogue"); setFeedback(null); }}><ArrowLeft size={15} /> Back to question bank</button>
                <div className="lite-quiz-meta"><span>{daily ? "DAILY CHALLENGE" : activeSet.category}</span><span>Question {question.question_index + 1} of {daily ? 5 : questionCount}</span></div>
                <div className="lite-quiz-progress"><span style={{ width: (((question.question_index + 1) / (daily ? 5 : questionCount)) * 100) + "%" }} /></div>
                <h2>{question.question}</h2>
                <div className="lite-answer-options">{question.options.map((option, index) => <button key={index} disabled={Boolean(feedback)} className={(selected === index ? "selected " : "") + (feedback && feedback.correct_answer === index + 1 ? "correct " : feedback && selected === index ? "incorrect" : "")} onClick={() => setSelected(index)}><span>{String.fromCharCode(65 + index)}</span>{option}</button>)}</div>
                {feedback && <div className={feedback.is_correct ? "lite-feedback correct" : "lite-feedback incorrect"}><strong>{feedback.is_correct ? "Correct answer" : "Not quite — review this explanation"}</strong><p>{feedback.explanation}</p></div>}
                <div className="lite-quiz-actions">{!feedback ? <button className="lite-learn-primary" disabled={selected === null || loading} onClick={() => void submit()}>Submit answer <ArrowRight size={17} /></button> : <button className="lite-learn-primary" disabled={loading} onClick={() => void nextQuestion()}>{question.question_index + 1 >= (daily ? 5 : questionCount) ? "Finish quiz" : "Next question"} <ArrowRight size={17} /></button>}</div>
              </section>
            )}
            {mode === "progress" && (
              <section className="lite-progress-panel"><div className="lite-progress-heading"><div><span className="lite-learn-step">YOUR PERFORMANCE</span><h2>Progress at a glance</h2></div><button className="lite-back-link" onClick={() => setMode("catalogue")}><ArrowLeft size={15} /> Back to practice</button></div>
                <div className="lite-progress-grid"><article><small>Questions attempted</small><strong>{progress?.total_attempts ?? 0}</strong></article><article><small>Correct answers</small><strong>{progress?.correct ?? 0}</strong></article><article><small>Accuracy</small><strong>{progress?.accuracy ?? 0}%</strong></article></div>
                <p className="lite-progress-note">Every submitted answer is saved to your learner profile, so you can continue building your performance record across sessions.</p>
              </section>
            )}
          </>
        )}

        <section className="lite-channel-card"><div><span className="lite-learn-step">LEARN WITHOUT A SMARTPHONE</span><h2>Continue through USSD and SMS.</h2><p>Register and answer daily questions from a basic phone. SMS learning is opt-in; reply STOP at any time to unsubscribe.</p></div><div className="lite-channel-status"><span><Phone size={16} /> USSD</span><span><MessageSquare size={16} /> SMS</span><small>The network short code and live messaging are activated after Africa's Talking credentials and service approval are configured.</small></div></section>
      </main>

      <footer className="lite-learn-footer"><div><strong>OmpathStudy Lite</strong><span>Learning that travels with you.</span></div><a href="https://www.ompathstudy.com" target="_blank" rel="noreferrer">Explore the full OmpathStudy library <ArrowRight size={14} /></a><small>For symptom intake and health guidance, visit <a href="/health-support">Health Support</a>.</small></footer>
    </div>
  );
}
