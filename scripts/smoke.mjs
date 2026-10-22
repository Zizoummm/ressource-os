import assert from "node:assert/strict";
const base = process.env.APP_URL ?? "http://localhost:3000";
assert.equal((await fetch(base)).status, 200);
assert.equal((await fetch(base + "/api/resource/state")).status, 401);
const login = await fetch(base + "/api/auth/login", {
  method: "POST",
  headers: { Origin: base, "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "regulator@axiom.demo",
    password: process.env.DEMO_PASSWORD,
  }),
});
assert.equal(login.status, 200);
const cookie = login.headers.get("set-cookie").split(";")[0];
const state = await fetch(base + "/api/resource/state", {
  headers: { Cookie: cookie },
});
assert.equal(state.status, 200);
const data = await state.json();
assert(data.cargoes.length >= 12);
assert(data.organizations.length >= 11);
assert(data.cargoes.some((c) => c.evaluation.blocking.length > 0));
assert.equal(
  (
    await fetch(base + "/api/resource/fiscal.csv", {
      headers: { Cookie: cookie },
    })
  ).status,
  200,
);
assert.equal(
  (
    await fetch(base + "/api/resource/action", {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: "https://untrusted.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "evaluate",
        data: { cargoId: data.cargoes[0].id },
      }),
    })
  ).status,
  403,
);
await fetch(base + "/api/auth/logout", {
  method: "POST",
  headers: { Cookie: cookie, Origin: base },
});
console.log(
  "ResourceOS HTTP smoke passed: login, database-backed state, tenant workspace, CSV, authentication and origin protection.",
);
