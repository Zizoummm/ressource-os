import { randomBytes } from "node:crypto";
import {
  existsSync,
  writeFileSync,
  readFileSync,
  appendFileSync,
} from "node:fs";
const existing = existsSync(".env") ? readFileSync(".env", "utf8") : "";
const pg = randomBytes(24).toString("hex");
const vars = {
  POSTGRES_PASSWORD: pg,
  DATABASE_URL: `postgresql://resourceos:${pg}@127.0.0.1:5432/resourceos`,
  DRT_SECRET: randomBytes(32).toString("hex"),
  DEMO_PASSWORD: randomBytes(18).toString("base64url"),
  APP_URL: "http://localhost:3000",
};
const missing = Object.entries(vars).filter(
  ([key]) => !new RegExp(`^${key}=`, "m").test(existing),
);
if (existing && missing.some(([k]) => k === "DATABASE_URL"))
  throw new Error(
    "Existing .env lacks DATABASE_URL; configure it explicitly to match the database.",
  );
if (!existsSync(".env")) writeFileSync(".env", "", { mode: 0o600, flag: "wx" });
appendFileSync(".env", missing.map(([k, v]) => `${k}=${v}\n`).join(""));
console.log(
  "ResourceOS local configuration prepared; existing values preserved. Secrets are not logged.",
);
