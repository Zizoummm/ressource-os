import { afterEach, describe, it, expect, vi } from "vitest";
import { appOrigin, dataDirectory } from "../src/server/runtime";
afterEach(() => vi.unstubAllEnvs());
describe("hosted origin and persistence configuration", () => {
  it("uses Render HTTPS origin when APP_URL is absent", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", undefined);
    vi.stubEnv("RENDER_EXTERNAL_URL", "https://axiom-test.onrender.com");
    expect(appOrigin()).toBe("https://axiom-test.onrender.com");
  });
  it("supports an explicitly configured custom HTTPS domain", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "https://resources.example.test/");
    vi.stubEnv("RENDER_EXTERNAL_URL", "https://axiom-test.onrender.com");
    expect(appOrigin()).toBe("https://resources.example.test");
  });
  it("refuses an unconfigured public origin in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", undefined);
    vi.stubEnv("RENDER_EXTERNAL_URL", undefined);
    expect(() => appOrigin()).toThrow("required");
  });
  it("refuses public cleartext origins and credential-bearing URLs", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "http://resources.example.test");
    expect(() => appOrigin()).toThrow("HTTPS");
    vi.stubEnv("APP_URL", "https://user:password@resources.example.test");
    expect(() => appOrigin()).toThrow("without credentials");
  });
  it("still supports a production-mode local demonstration", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    expect(appOrigin()).toBe("http://localhost:3000");
  });
  it("selects the configured persistent mount for hosted evidence", () => {
    vi.stubEnv("RESOURCEOS_DATA_DIR", "/var/data/resourceos");
    expect(dataDirectory()).toBe("/var/data/resourceos");
  });
});
