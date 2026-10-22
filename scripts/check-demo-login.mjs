import { createRequire } from "node:module";
import { compare } from "bcryptjs";

const require = createRequire(import.meta.url);
// Loaded through --import tsx; the command runs in the same service environment as the app.
const { db } = require("../src/server/db.ts");
const email = "admin@axiom.demo";
let sessionCookie;
let base;
let origin;
try {
  const password = process.env.DEMO_PASSWORD;
  console.log("DEMO_PASSWORD configured:", Boolean(password));
  const user = await db.user.findUnique({
    where: { email },
    select: { active: true, passwordHash: true },
  });
  console.log("Administrator account exists:", Boolean(user));
  console.log("Administrator account active:", Boolean(user?.active));
  const matches = Boolean(
    password && user && (await compare(password, user.passwordHash)),
  );
  console.log("DEMO_PASSWORD matches stored account:", matches);
  origin = new URL(
    process.env.APP_URL ||
      process.env.RENDER_EXTERNAL_URL ||
      "http://localhost:3000",
  ).origin;
  console.log("Configured public origin:", origin);
  const port = process.env.PORT || "10000";
  if (!/^\d+$/.test(port)) throw new Error("Invalid service port.");
  base = `http://127.0.0.1:${port}`;
  const response = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: password || "" }),
    signal: AbortSignal.timeout(10000),
  });
  console.log("Login API HTTP status:", response.status);
  if (!response.ok) {
    let code = "UNEXPECTED_RESPONSE";
    try {
      const { error } = await response.json();
      const known = new Set([
        "Invalid email or password.",
        "Invalid request origin.",
        "Too many attempts. Try again in 15 minutes.",
        "Invalid login request.",
      ]);
      if (known.has(error)) code = error;
    } catch {}
    console.log("Login API result:", code);
    process.exitCode = 1;
  } else {
    sessionCookie = response.headers.get("set-cookie")?.split(";")[0];
    if (!sessionCookie) throw new Error("No session cookie.");
    const session = await fetch(base + "/api/session", {
      headers: { Cookie: sessionCookie },
      signal: AbortSignal.timeout(10000),
    });
    console.log("Authenticated session HTTP status:", session.status);
    if (!session.ok) process.exitCode = 1;
  }
} catch {
  console.error(
    "Diagnostic could not complete. Check service/database availability; no credentials were logged.",
  );
  process.exitCode = 1;
} finally {
  if (sessionCookie && base && origin) {
    try {
      await fetch(base + "/api/auth/logout", {
        method: "POST",
        headers: { Cookie: sessionCookie, Origin: origin },
        signal: AbortSignal.timeout(10000),
      });
    } catch {}
  }
  await db.$disconnect();
}
