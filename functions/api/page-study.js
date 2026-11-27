import aiHandler from "../../api/ai.js";
import { runVercelHandler } from "../_lib/vercel-adapter.js";

export const onRequest = ({ request }) => {
  const url = new URL(request.url);
  url.pathname = "/api/ai";
  url.searchParams.set("task", "study");
  const routed = new Request(url, request);
  return runVercelHandler(aiHandler, routed);
};
