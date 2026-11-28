import { describe, expect, it } from "vitest";
import { bearer } from "../../api/_lib/topicWrite.js";

describe("topic generation authentication header", () => {
  it("strips the Bearer prefix from Neon session tokens", () => {
    expect(bearer({ headers: { authorization: "Bearer header.payload.signature" } })).toBe("header.payload.signature");
  });

  it("prefers the explicit Neon authorization header", () => {
    expect(bearer({ headers: {
      "x-neon-authorization": "Bearer neon.header.signature",
      authorization: "Bearer other.header.signature",
    } })).toBe("neon.header.signature");
  });
});
