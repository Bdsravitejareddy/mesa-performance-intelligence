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

const login = await fetch(new URL("/login", base));
assert.equal(login.status, 200);
console.log("Private access verified: home and course API require login; login page is available.");
