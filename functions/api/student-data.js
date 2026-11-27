import handler from "../../api/_lib/student-data.js";
import { runVercelHandler } from "../_lib/vercel-adapter.js";

export const onRequest = ({ request }) => runVercelHandler(handler, request);
