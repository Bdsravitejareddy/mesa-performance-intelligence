import assert from "node:assert/strict";

// Run against a built app configured with Supabase and demo mode disabled.
// Uses no account, credentials, or email request.
const base = process.argv[2];
assert.ok(base, "Usage: node scripts/check-private-access.mjs <base-url>");
const response = await fetch(new URL("/", base), { redirect: "manual" });
assert.ok([307, 308].includes(response.status), `Anonymous home request must redirect; received ${response.status}`);
assert.equal(new URL(response.headers.get("location"), base).pathname, "/login");

const api = await fetch(new URL("/api/courses", base), { redirect: "manual" });
assert.ok([307, 308].includes(api.status), `Anonymous course API must redirect; received ${api.status}`);
assert.equal(new URL(api.headers.get("location"), base).pathname, "/login");

for (const path of ['/drive-sync','/api/drive-sync/connections','/api/drive-sync/connections/11111111-1111-4111-8111-111111111111/pairing','/api/drive-sync/sources/11111111-1111-4111-8111-111111111111/retry']) {
  const response=await fetch(new URL(path,base),{redirect:'manual'});
  assert.ok([307,308].includes(response.status), `Anonymous ${path} must require login; received ${response.status}`);
  assert.equal(new URL(response.headers.get('location'),base).pathname,'/login');
}
for (const endpoint of ['pair','session','inventory','upload','finalize','checkpoint']) {
  const response=await fetch(new URL(`/api/drive-agent/${endpoint}`,base),{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',redirect:'manual'});
  assert.equal(response.status,endpoint==='pair'?400:401, `Machine ${endpoint} must reject missing ${endpoint==='pair'?'pairing code':'credentials'}`);
  assert.match(response.headers.get('content-type') ?? '', /application\/json/);
  if(endpoint!=='pair') {
    const wrong=await fetch(new URL(`/api/drive-agent/${endpoint}`,base),{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer invalid'},body:'{}',redirect:'manual'});
    assert.equal(wrong.status,401, `Machine ${endpoint} must reject malformed credentials before privileged work`);
  }
}
const login = await fetch(new URL("/login", base));
assert.equal(login.status, 200);
console.log("Private access verified: dashboard/Drive management require login; pairing rejects a missing code and the five bearer routes reject absent/malformed credentials; login is available.");
