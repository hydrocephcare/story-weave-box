import handler from "../../api/google-drive-import.js";
import { runVercelHandler } from "../_lib/vercel-adapter.js";

export const onRequest = ({ request }) => runVercelHandler(handler, request);
