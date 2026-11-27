import handler from "../../api/_lib/drive-notes.js";
import { runVercelHandler } from "../_lib/vercel-adapter.js";
export const onRequest = ({ request }) => runVercelHandler(handler, request);
