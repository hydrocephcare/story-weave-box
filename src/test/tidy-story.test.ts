import { describe, expect, it } from "vitest";
import { tidyPlain, tidyText } from "@/lib/tidyStory";

describe("tidyStory", () => {
  it("fixes spacing and capitals", () => {
    expect(tidyText("i went to the ward ,it was late. then i slept")).toBe("I went to the ward, it was late. Then I slept");
  });
  it("starts every paragraph with a capital", () => {
    expect(tidyPlain("first day.\n\n\n\nsecond day")).toBe("First day.\n\nSecond day");
  });
});
