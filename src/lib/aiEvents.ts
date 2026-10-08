// The only part of Ompath AI that the rest of the site imports: a way to open it. The panel itself is loaded on demand.
export const OPEN_AI_EVENT = "ompath:open-ai";
/** Open Ompath AI from anywhere; with a question, it is asked straight away. */
export const openAI = (question = "") => window.dispatchEvent(new CustomEvent(OPEN_AI_EVENT, { detail: question }));
export const AI_RESUME_KEY = "ompath_ai_resume";
