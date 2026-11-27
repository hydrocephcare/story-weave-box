import aiHandler from "../../api/ai.js";
import { runVercelHandler } from "../_lib/vercel-adapter.js";

export const onRequest = ({ request }) => runVercelHandler(aiHandler, request);
