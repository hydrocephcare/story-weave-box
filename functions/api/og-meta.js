import handler from "../../api/og-meta.ts";
import { runVercelHandler } from "../_lib/vercel-adapter.js";
export const onRequest = ({ request }) => runVercelHandler(handler, request);
