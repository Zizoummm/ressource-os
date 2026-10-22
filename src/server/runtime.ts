import { join } from "node:path";

/** Render supplies its canonical HTTPS URL; APP_URL can override it for a custom domain. */
export function appOrigin(): string {
  const configured = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL;
  if (!configured && process.env.NODE_ENV === "production") {
    throw new Error(
      "APP_URL or RENDER_EXTERNAL_URL is required when serving the application.",
    );
  }
  const url = new URL(configured || "http://localhost:3000");
  if (
    url.username ||
    url.password ||
    !["http:", "https:"].includes(url.protocol)
  ) {
    throw new Error(
      "The application origin must be an HTTP(S) URL without credentials.",
    );
  }
  if (
    process.env.NODE_ENV === "production" &&
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  ) {
    throw new Error(
      "A public deployment requires an HTTPS application origin.",
    );
  }
  return url.origin;
}

/** Keep evidence and the simulator journal on the hosting provider's persistent disk. */
export function dataDirectory(): string {
  return process.env.RESOURCEOS_DATA_DIR || join(process.cwd(), ".data");
}
