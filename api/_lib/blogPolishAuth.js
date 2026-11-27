import { createRemoteJWKSet, jwtVerify } from "jose";

const AUDIENCE="ompathstudy-blog-polish";
const WORKFLOW_REF="hydrocephcare/story-weave-box/.github/workflows/blogs-polish.yml@refs/heads/main";
const jwks=createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));

export async function isTrustedBlogWorkflow(value) {
  const token=String(value||"").replace(/^Bearer\s+/i,"").trim();
  if(!token) return false;
  try {
    const {payload}=await jwtVerify(token,jwks,{issuer:"https://token.actions.githubusercontent.com",audience:AUDIENCE});
    return payload.repository==="hydrocephcare/story-weave-box"
      && payload.workflow_ref===WORKFLOW_REF
      && payload.ref==="refs/heads/main"
      && ["schedule","workflow_dispatch"].includes(String(payload.event_name||""));
  } catch { return false; }
}
