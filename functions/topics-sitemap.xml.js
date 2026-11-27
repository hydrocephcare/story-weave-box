import handler from "../api/sitemap.js";
import { runVercelHandler } from "./_lib/vercel-adapter.js";
export const onRequest = ({ request }) => {
  const url = new URL(request.url); url.searchParams.set("mode", "topics");
  return runVercelHandler(handler, new Request(url, request));
};
