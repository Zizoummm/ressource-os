import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

for (const name of ["DATABASE_URL", "DRT_SECRET"]) {
  if (
    !process.env[name] ||
    (name === "DRT_SECRET" && process.env[name].length < 32)
  ) {
    throw new Error(
      `Configure ${name} in the hosting provider's environment settings.`,
    );
  }
}
const origin = new URL(
  process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "",
);
if (origin.username || origin.password || origin.protocol !== "https:") {
  throw new Error(
    "Set APP_URL or RENDER_EXTERNAL_URL to the canonical HTTPS origin.",
  );
}
const directory = process.env.RESOURCEOS_DATA_DIR;
if (!directory || !isAbsolute(directory))
  throw new Error(
    "Set RESOURCEOS_DATA_DIR to an absolute persistent-disk path.",
  );
if (
  process.env.ALLOW_DEMO_SEED === "true" &&
  (!process.env.DEMO_PASSWORD || process.env.DEMO_PASSWORD.length < 16)
) {
  throw new Error(
    "Configure a private DEMO_PASSWORD of at least 16 characters.",
  );
}
const port = process.env.PORT || "10000";
if (!/^\d+$/.test(port) || +port < 1 || +port > 65535)
  throw new Error("Invalid PORT.");
await mkdir(directory, { recursive: true });

let child;
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    stopping = true;
    child?.kill(signal);
  });
}
function run(args) {
  return new Promise((resolve, reject) => {
    child = spawn(process.execPath, args, {
      stdio: "inherit",
      env: process.env,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) =>
      code === 0
        ? resolve()
        : reject(new Error(`Hosted subprocess stopped (${signal || code}).`)),
    );
  });
}
try {
  await run(["scripts/migrate.mjs"]);
  if (stopping) process.exit(0);
  if (process.env.ALLOW_DEMO_SEED === "true")
    await run(["--import", "tsx", "prisma/seed.ts"]);
  if (stopping) process.exit(0);
  await run([
    join("node_modules", "next", "dist", "bin", "next"),
    "start",
    "--hostname",
    "0.0.0.0",
    "--port",
    port,
  ]);
} catch (error) {
  if (!stopping) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
