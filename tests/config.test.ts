import { beforeEach, describe, expect, it, vi } from "vitest";

describe("loadConfig", () => {
  const validEnv = {
    EMAIL_HOST: "imap.example.com",
    EMAIL_PORT: "993",
    EMAIL_USER: "user@example.com",
    EMAIL_PASS: "secret",
    SMTP_HOST: "smtp.example.com",
    SMTP_PORT: "465",
    SMTP_USER: "user@example.com",
    SMTP_PASS: "secret",
  };

  beforeEach(() => {
    vi.resetModules();
  });

  it("returns typed config when all env vars are present", async () => {
    Object.assign(process.env, validEnv);
    const { loadConfig } = await import("../src/config.js");
    const config = loadConfig();
    expect(config.imap.host).toBe("imap.example.com");
    expect(config.imap.port).toBe(993);
    expect(config.smtp.host).toBe("smtp.example.com");
    expect(config.smtp.port).toBe(465);
  });

  it("throws when EMAIL_HOST is missing", async () => {
    Object.assign(process.env, validEnv);
    // biome-ignore lint/performance/noDelete: must remove key entirely for zod to see it as missing
    delete process.env.EMAIL_HOST;
    const { loadConfig } = await import("../src/config.js");
    expect(() => loadConfig()).toThrow(/EMAIL_HOST/);
  });

  it("throws when EMAIL_PORT is not a number", async () => {
    Object.assign(process.env, { ...validEnv, EMAIL_PORT: "not-a-number" });
    const { loadConfig } = await import("../src/config.js");
    expect(() => loadConfig()).toThrow(/EMAIL_PORT/);
  });

  it("throws when SMTP_PORT is out of range", async () => {
    Object.assign(process.env, { ...validEnv, SMTP_PORT: "99999" });
    const { loadConfig } = await import("../src/config.js");
    expect(() => loadConfig()).toThrow(/SMTP_PORT/);
  });
});
