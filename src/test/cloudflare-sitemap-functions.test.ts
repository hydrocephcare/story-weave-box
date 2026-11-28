import { describe, expect, it } from "vitest";
import { onRequest as sitemapIndex } from "../../functions/api/sitemap-index.js";
import { onRequestGet as robots } from "../../functions/robots.txt";
import { onRequestGet as sitemap } from "../../functions/sitemap.xml";

const request = (url: string, host: string) => new Request(url, { headers: { host } });

describe("Cloudflare sitemap Pages Functions", () => {
  it("serves the main sitemap index through the shared Vercel adapter", async () => {
    const response = await sitemapIndex({ request: request("https://www.ompathstudy.com/api/sitemap-index", "www.ompathstudy.com") } as never);
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/xml");
    expect(body).toContain("<sitemapindex");
    expect(body).toContain("https://www.ompathstudy.com/topics-sitemap.xml");
    expect(body).toContain("https://www.ompathstudy.com/library-sitemap.xml");
  });

  it("serves the main robots policy from the shared handler", async () => {
    const response = await robots({ request: request("https://www.ompathstudy.com/robots.txt", "www.ompathstudy.com") } as never);
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(body).toContain("Sitemap: https://www.ompathstudy.com/topics-sitemap.xml");
    expect(body).toContain("Disallow: /contests/*/register");
  });

  it("serves the stories robots policy without routing to the main sitemap", async () => {
    const response = await robots({ request: request("https://stories.ompathstudy.com/robots.txt", "stories.ompathstudy.com") } as never);
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain("Sitemap: https://stories.ompathstudy.com/sitemap.xml");
    expect(body).toContain("User-agent: GPTBot");
  });

  it("serves the stories sitemap index", async () => {
    const response = await sitemap({ request: request("https://stories.ompathstudy.com/sitemap.xml", "stories.ompathstudy.com") } as never);
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/xml");
    expect(body).toContain("https://stories.ompathstudy.com/stories-sitemap.xml");
  });

  it("serves the main sitemap index through the shared adapter", async () => {
    const response = await sitemap({ request: request("https://www.ompathstudy.com/sitemap.xml", "www.ompathstudy.com") } as never);
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain("<sitemapindex");
    expect(body).toContain("https://www.ompathstudy.com/topics-sitemap.xml");
    expect(body).toContain("https://www.ompathstudy.com/image-sitemap.xml");
  });
});
