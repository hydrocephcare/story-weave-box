import { describe, expect, it } from "vitest";
import { textToHtml } from "@/components/StoryComposer";
import { storyToEditable } from "@/lib/storyOwner";

const published = (name: string, text: string) => `<p><em>By ${name} · Year 3</em></p>${textToHtml(text)}`;

describe("editing a published story", () => {
  it("gives back exactly what the student wrote", () => {
    const text = "My first day.\nIt was <loud> & busy.\n\n## What I learned\n\nAsk questions.";
    const e = storyToEditable(published("Amina W", text));
    expect(e.body).toBe(text);
    expect(e.name).toBe("Amina W");
    expect(e.anonymous).toBe(false);
  });
  it("remembers a story was anonymous", () => {
    const e = storyToEditable(published("A medical student", "Hello there"));
    expect(e.anonymous).toBe(true);
    expect(e.name).toBe("");
  });
  it("never lets typed HTML through", () => {
    expect(textToHtml("<script>alert(1)</script>")).not.toContain("<script>");
  });
});
