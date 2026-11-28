import { createRemoteJWKSet, jwtVerify } from "jose";

const AUDIENCE="ompathstudy-blog-polish";
const WORKFLOW_REFS=new Set([
  "hydrocephcare/story-weave-box/.github/workflows/blogs-polish.yml@refs/heads/main",
  "hydrocephcare/story-weave-box/.github/workflows/blogs-restructure.yml@refs/heads/main",
]);
const jwks=createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));

export async function isTrustedBlogWorkflow(value) {
  const token=String(value||"").replace(/^Bearer\s+/i,"").trim();
  if(!token) return false;
  try {
    const {payload}=await jwtVerify(token,jwks,{issuer:"https://token.actions.githubusercontent.com",audience:AUDIENCE});
    const stagingBranch=String(process.env.BLOG_POLISH_STAGING_BRANCH||"").trim();
    const validStagingBranch=/^[A-Za-z0-9._/-]+$/.test(stagingBranch)&&!stagingBranch.includes("..");
    const allowedBranches=new Set(["refs/heads/main"]);
    const allowedRefs=new Set(WORKFLOW_REFS);
    if(validStagingBranch&&stagingBranch!=="main") {
      const ref="refs/heads/"+stagingBranch;
      allowedBranches.add(ref);
      allowedRefs.add("hydrocephcare/story-weave-box/.github/workflows/blogs-polish.yml@"+ref);
    }
    return payload.repository==="hydrocephcare/story-weave-box"
      && allowedRefs.has(String(payload.workflow_ref||""))
      && allowedBranches.has(String(payload.ref||""))
      && ["schedule","workflow_dispatch"].includes(String(payload.event_name||""));
  } catch { return false; }
}
