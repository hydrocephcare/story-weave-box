import handler from "../../api/source-pdf.js";
import { runVercelHandler } from "../_lib/vercel-adapter.js";
export const onRequest = ({ request }) => runVercelHandler(handler, request);
