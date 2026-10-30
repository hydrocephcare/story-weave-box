import { describe, expect, it } from "vitest";
import { fetchRemoteImage } from "../src/lib/images";

describe("import from a web link: what is refused before anything is downloaded", () => {
  it("refuses non-https links", async () => {
    await expect(fetchRemoteImage("http://example.com/a.png")).rejects.toThrow(/https/);
    await expect(fetchRemoteImage("ftp://example.com/a.png")).rejects.toThrow(/https/);
  });
  it("refuses IP addresses and local names (no reaching into private networks)", async () => {
    await expect(fetchRemoteImage("https://127.0.0.1/a.png")).rejects.toThrow(/public website/);
    await expect(fetchRemoteImage("https://192.168.1.5/a.png")).rejects.toThrow(/public website/);
    await expect(fetchRemoteImage("https://localhost/a.png")).rejects.toThrow(/public website/);
    await expect(fetchRemoteImage("https://printer.local/a.png")).rejects.toThrow(/public website/);
    await expect(fetchRemoteImage("https://[::1]/a.png")).rejects.toThrow(/public website/);
  });
  it("refuses text that is not a web address", async () => {
    await expect(fetchRemoteImage("not a url")).rejects.toThrow(/valid web address/);
  });
});
