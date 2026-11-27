import handler from "../../api/neon-functions.js";
import { runVercelHandler } from "../_lib/vercel-adapter.js";

const run = ({ request }) => runVercelHandler(handler, request);
export const onRequest = run;
export const onRequestPost = run;
export const onRequestOptions = run;
