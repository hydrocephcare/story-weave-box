import handler from "../../api/_lib/ensureUser.js";
import { runVercelHandler } from "../_lib/vercel-adapter.js";

// Explicit method handlers ensure Pages dispatches POST account preparation
// through the legacy handler rather than falling through to a static 405.
const run = ({ request }) => runVercelHandler(handler, request);

export const onRequest = run;
export const onRequestPost = run;
export const onRequestOptions = run;
