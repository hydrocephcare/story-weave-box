import handler from "../../api/google-drive-oauth.js";
import { runVercelHandler } from "../_lib/vercel-adapter.js";

export const onRequest = ({ request }) => runVercelHandler(handler, request);
