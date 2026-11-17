import { describe, expect, it } from "vitest";
import { isEligiblePatientResource } from "./ompathLiteResources.js";

describe("OmpathStudy Lite patient-resource eligibility", () => {
  const approved = { published: true, deleted_at: null, requires_review: false, verification_status: "reviewed", content_type: "patient_guide" };

  it("allows published reviewed patient guides", () => {
    expect(isEligiblePatientResource(approved)).toBe(true);
  });

  it("rejects ordinary medical-school notes even when marked reviewed", () => {
    expect(isEligiblePatientResource({ ...approved, content_type: "medical_notes" })).toBe(false);
  });

  it("rejects imported or unreviewed patient content", () => {
    expect(isEligiblePatientResource({ ...approved, verification_status: "imported" })).toBe(false);
    expect(isEligiblePatientResource({ ...approved, requires_review: true })).toBe(false);
  });

  it("rejects unpublished or deleted resources", () => {
    expect(isEligiblePatientResource({ ...approved, published: false })).toBe(false);
    expect(isEligiblePatientResource({ ...approved, deleted_at: "2026-01-01T00:00:00Z" })).toBe(false);
  });
});