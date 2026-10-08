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

import { cleanStoryHtml } from "@/components/StoryComposer";
import { storyThumb } from "@/lib/storyShare";

describe("story html and thumbnails", () => {
  it("keeps formatting and drops anything dangerous", () => {
    const out = cleanStoryHtml('<h2>Hi</h2><p onclick="x()">a <strong>b</strong><script>alert(1)</script><img src=x onerror=alert(1)></p><a href="javascript:alert(1)">bad</a><a href="https://example.com">ok</a>');
    expect(out).toContain("<h2>Hi</h2>");
    expect(out).toContain("<strong>b</strong>");
    expect(out).not.toMatch(/script|onclick|onerror|<img|javascript:/i);
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('rel="nofollow ugc noopener"');
  });
  it("picks a share picture for each topic", () => {
    expect(storyThumb("Exams & study")).toMatch(/exams-study\.png$/);
    expect(storyThumb("First-year life")).toMatch(/first-year-life\.png$/);
    expect(storyThumb("Something custom")).toMatch(/other\.png$/);
  });
});
