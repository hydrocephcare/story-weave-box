import { describe, expect, it } from "vitest";
import { isEligiblePatientResource } from "./ompathLiteResources.js";

describe("OmpathStudy Lite patient-guide eligibility",()=>{
 const now=new Date(),updated=new Date(now.getTime()-86400000).toISOString();
 const article={published:true,deleted_at:null,requires_review:false,verification_status:"reviewed",content_type:"patient_guide",updated_at:updated};
 const approval={status:"approved",review_due_at:new Date(now.getTime()+86400000).toISOString(),article_updated_at_snapshot:updated};
 it("requires a current separate Lite approval",()=>{expect(isEligiblePatientResource(article,approval)).toBe(true);expect(isEligiblePatientResource(article,null)).toBe(false);});
 it("rejects ordinary notes, imported, unpublished or deleted content",()=>{
  expect(isEligiblePatientResource({...article,content_type:"medical_notes"},approval)).toBe(false);
  expect(isEligiblePatientResource({...article,verification_status:"imported"},approval)).toBe(false);
  expect(isEligiblePatientResource({...article,published:false},approval)).toBe(false);
  expect(isEligiblePatientResource({...article,deleted_at:now.toISOString()},approval)).toBe(false);
 });
 it("rejects expired, suspended or outdated approvals",()=>{
  expect(isEligiblePatientResource(article,{...approval,review_due_at:new Date(now.getTime()-1000).toISOString()})).toBe(false);
  expect(isEligiblePatientResource(article,{...approval,status:"suspended"})).toBe(false);
  expect(isEligiblePatientResource({...article,updated_at:now.toISOString()},approval)).toBe(false);
 });
});
