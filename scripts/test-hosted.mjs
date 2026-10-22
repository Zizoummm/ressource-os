import { constants } from "node:fs";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, cp, readdir, rm, open } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import net from "node:net";
import pg from "pg";

const root = process.cwd();
const directory = await mkdtemp(join(tmpdir(), "resourceos-hosted-"));
const name = "resourceos_hosted_" + randomBytes(5).toString("hex");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
let created = false,
  completed = false,
  server;
const logs = await open(join(directory, "startup.log"), "w", 0o600);
await client.connect();
try {
  await client.query(`CREATE DATABASE "${name}"`);
  created = true;
  for (const path of ["package.json", "prisma", "scripts", "src", ".next"])
    await cp(join(root, path), join(directory, path), {
      recursive: true,
      filter: (source) => !source.includes("/.next/cache"),
    });
  await cp(join(root, "node_modules"), join(directory, "node_modules"), {
    recursive: true,
    mode: constants.COPYFILE_FICLONE,
  });
  const dbUrl = new URL(process.env.DATABASE_URL);
  dbUrl.pathname = "/" + name;
  const probe = net.createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const origin = "https://resourceos-hosted-check.example";
  const password = randomBytes(24).toString("hex");
  const env = {
    ...process.env,
    NODE_ENV: "production",
    DATABASE_URL: dbUrl.toString(),
    DRT_SECRET: randomBytes(32).toString("hex"),
    DEMO_PASSWORD: password,
    ALLOW_DEMO_SEED: "true",
    PORT: String(port),
    RENDER_EXTERNAL_URL: origin,
    RESOURCEOS_DATA_DIR: join(directory, "persistent"),
  };
  delete env.APP_URL;
  const base = `http://127.0.0.1:${port}`;
  async function start() {
    server = spawn(process.execPath, ["scripts/start-hosted.mjs"], {
      cwd: directory,
      env,
      stdio: ["ignore", logs.fd, logs.fd],
    });
    let launchError;
    server.on("error", (error) => {
      launchError = error;
    });
    for (let i = 0; i < 120; i++) {
      if (launchError || server.exitCode !== null)
        throw new Error(
          "Hosted startup failed; inspect the private temporary startup log.",
        );
      try {
        const response = await fetch(base + "/api/health", {
          signal: AbortSignal.timeout(2000),
        });
        if (response.ok) return;
      } catch {}
      await delay(500);
    }
    throw new Error("Hosted startup health check timed out.");
  }
  async function stop() {
    if (!server || server.exitCode !== null) return;
    const exited = once(server, "exit");
    server.kill("SIGTERM");
    const timeout = setTimeout(() => {
      if (server?.exitCode === null) server.kill("SIGKILL");
    }, 10000);
    try {
      await exited;
    } finally {
      clearTimeout(timeout);
    }
  }
  async function session() {
    const result = await fetch(base + "/api/auth/login", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "regulator@axiom.demo", password }),
    });
    assert.equal(result.status, 200, result.ok ? "" : await result.text());
    const cookie = result.headers.get("set-cookie");
    assert(cookie.includes("Secure"));
    assert(cookie.includes("HttpOnly"));
    return cookie.split(";")[0];
  }
  await start();
  assert.equal((await fetch(base + "/api/resource/state")).status, 401);
  let cookie = await session();
  const state = await (
    await fetch(base + "/api/resource/state", { headers: { Cookie: cookie } })
  ).json();
  assert.equal(state.cargoes.length, 12);
  const sample = state.cargoes.find((c) => c.documents.length > 0);
  assert(sample);
  const doc = sample.documents[0];
  assert.equal(
    (
      await fetch(base + "/api/resource/documents/" + doc.id, {
        headers: { Cookie: cookie },
      })
    ).status,
    200,
  );
  const files = await readdir(join(directory, "persistent", "documents"));
  assert.equal(files.length, 12);
  const blocked = await fetch(base + "/api/resource/action", {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: "https://untrusted.example",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "evaluate", data: { cargoId: sample.id } }),
  });
  assert.equal(blocked.status, 403);
  const release = state.cargoes
    .flatMap((c) => c.tokens)
    .find((t) => !t.revokedAt && new Date(t.expiresAt) > new Date());
  assert(release);
  assert.equal(
    (
      await (
        await fetch(
          base + "/api/resource/verify/" + encodeURIComponent(release.token),
        )
      ).json()
    ).status,
    "VALID",
  );
  await stop();
  await start();
  cookie = await session();
  const restarted = await (
    await fetch(base + "/api/resource/state", { headers: { Cookie: cookie } })
  ).json();
  assert.equal(restarted.cargoes.length, 12);
  assert.equal(
    (
      await fetch(base + "/api/resource/documents/" + doc.id, {
        headers: { Cookie: cookie },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await (
        await fetch(
          base + "/api/resource/verify/" + encodeURIComponent(release.token),
        )
      ).json()
    ).status,
    "VALID",
  );
  console.log(
    "Hosted deployment check passed: fresh database migrations and seed without .env, HTTPS-origin authentication, Secure cookies, persistent evidence, token verification and restart.",
  );
  await stop();
  completed = true;
} finally {
  if (server && server.exitCode === null) {
    const exited = once(server, "exit");
    server.kill("SIGTERM");
    await exited;
  }
  if (created) await client.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await client.end();
  await logs.close();
  if (completed) await rm(directory, { recursive: true, force: true });
  else
    console.error("Private hosted diagnostic files retained at " + directory);
}
