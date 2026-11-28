import { describe, expect, it } from "vitest";
import { extractBearer } from "../../api/_lib/topicWrite.js";

describe("topic write bearer authentication", () => {
  it("strips the standard Bearer prefix", () => {
    expect(extractBearer({ headers: { authorization: "Bearer neon-user-token" } })).toBe("neon-user-token");
  });

  it("accepts the internal raw Neon authorization header", () => {
    expect(extractBearer({ headers: { "x-neon-authorization": "neon-user-token" } })).toBe("neon-user-token");
  });

  it("prefers the internal Neon authorization header when both are supplied", () => {
    expect(extractBearer({ headers: { "x-neon-authorization": "internal-token", authorization: "Bearer public-token" } })).toBe("internal-token");
  });
});
