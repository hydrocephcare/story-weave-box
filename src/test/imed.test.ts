import { describe, expect, it } from "vitest";
import { IMED, RELATIONS, isPublished, linksFor, topicById } from "@/data/imed";

describe("IMED curriculum", () => {
  const ids = IMED.flatMap((s) => s.topics.map((t) => t.id));
  it("has unique topic ids", () => { expect(new Set(ids).size).toBe(ids.length); });
  it("only relates topics that exist, never to itself, with a reason", () => {
    for (const r of RELATIONS) {
      expect(topicById(r.from), `from ${r.from}`).not.toBeNull();
      expect(topicById(r.to), `to ${r.to}`).not.toBeNull();
      expect(r.from).not.toBe(r.to);
      expect(r.why.length).toBeGreaterThan(15);
    }
  });
  it("lists pneumonia's links in reading order with the prerequisite first", () => {
    const l = linksFor("pneumonia");
    expect(l[0].type).toBe("prerequisite");
    expect(l.map((x) => x.topic.id)).toEqual(expect.arrayContaining(["tb", "pcp", "pleural-effusion", "sepsis", "resp-failure"]));
  });
  it("publishes only topics whose note is registered", () => {
    expect(isPublished(topicById("pneumonia")!.topic)).toBe(true);
    expect(isPublished({ id: "x", name: "x", note: "no-such-note" })).toBe(false);
    expect(isPublished({ id: "y", name: "y" })).toBe(false);
  });
});

import { mdToHtml } from "@/lib/miniMarkdown.js";
describe("markdown converter", () => {
  it("does not hang on a table that was cut off", () => {
    const html = mdToHtml("## A\n\n| Symptom | Causes to\n## B\ntext", { skipTitle: true }).html;
    expect(html).toContain("<h2");
  });
});
