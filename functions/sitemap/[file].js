import handler from "../../api/sitemap.js";
import { runVercelHandler } from "../_lib/vercel-adapter.js";
export const onRequest = ({ request, params }) => {
  const url = new URL(request.url); url.searchParams.set("file", String(params.file || "all.xml"));
  return runVercelHandler(handler, new Request(url, request));
};
