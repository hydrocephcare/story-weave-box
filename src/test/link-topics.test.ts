import { describe, expect, it } from "vitest";
import { linkTopics } from "@/lib/noteLinks";

const topics = [{ s: "humerus", n: "Humerus" }, { s: "oppositional-defiant-disorder", n: "Oppositional defiant disorder" }, { s: "asthma", n: "Asthma" }];

describe("linkTopics", () => {
  it("links the first mention of a topic to its page", () => {
    const out = linkTopics("<p>The humerus is a long bone. Fractures of the humerus are common.</p>", topics);
    expect(out).toContain('<a class="note-link topic-link" href="/topic/humerus">humerus</a> is a long bone');
    expect(out.match(/topic-link/g)).toHaveLength(1);
  });

  it("leaves headings, existing links and the practice questions alone", () => {
    const html = "<h2>Humerus</h2><p><a href=\"/x\">humerus</a></p><h2>Practice questions</h2><p>Which bone is the humerus?</p>";
    expect(linkTopics(html, topics)).toBe(html);
  });

  it("does not link a topic the note is about", () => {
    const out = linkTopics("<p>Asthma and the humerus.</p>", topics, { skip: ["asthma"] });
    expect(out).not.toContain("/topic/asthma");
    expect(out).toContain("/topic/humerus");
  });

  it("stops at the limit", () => {
    const out = linkTopics("<p>Humerus, asthma, oppositional defiant disorder.</p>", topics, { limit: 2 });
    expect(out.match(/topic-link/g)).toHaveLength(2);
  });
});
