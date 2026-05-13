import { beforeEach, describe, expect, it, vi } from "vitest";

describe("loadConfig", () => {
  const requiredEnv = {
    EMAIL_HOST: "imap.example.com",
    EMAIL_PORT: "993",
    EMAIL_USER: "user@example.com",
    EMAIL_PASS: "secret",
  };

  beforeEach(() => {
    vi.resetModules();
    // Clear all relevant env vars before each test
    for (const key of [
      "EMAIL_HOST",
      "EMAIL_PORT",
      "EMAIL_USER",
      "EMAIL_PASS",
      "SMTP_HOST",
      "SMTP_PORT",
      "SMTP_USER",
      "SMTP_PASS",
    ]) {
      delete process.env[key];
    }
  });

  it("returns typed config when only EMAIL_* vars are set", async () => {
    Object.assign(process.env, requiredEnv);
    const { loadConfig } = await import("../src/config.js");
    const config = loadConfig();
    expect(config.imap.host).toBe("imap.example.com");
    expect(config.imap.port).toBe(993);
    expect(config.smtp.host).toBe("imap.example.com");
    expect(config.smtp.port).toBe(993);
    expect(config.smtp.user).toBe("user@example.com");
    expect(config.smtp.pass).toBe("secret");
  });

  it("SMTP_* overrides take effect when provided", async () => {
    Object.assign(process.env, requiredEnv, {
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "465",
      SMTP_USER: "smtp-user@example.com",
      SMTP_PASS: "smtp-secret",
    });
    const { loadConfig } = await import("../src/config.js");
    const config = loadConfig();
    expect(config.smtp.host).toBe("smtp.example.com");
    expect(config.smtp.port).toBe(465);
    expect(config.smtp.user).toBe("smtp-user@example.com");
    expect(config.smtp.pass).toBe("smtp-secret");
    // IMAP unchanged
    expect(config.imap.host).toBe("imap.example.com");
  });

  it("throws when EMAIL_HOST is missing", async () => {
    Object.assign(process.env, requiredEnv);
    delete process.env.EMAIL_HOST;
    const { loadConfig } = await import("../src/config.js");
    expect(() => loadConfig()).toThrow(/EMAIL_HOST/);
  });

  it("throws when EMAIL_PORT is not a number", async () => {
    Object.assign(process.env, { ...requiredEnv, EMAIL_PORT: "not-a-number" });
    const { loadConfig } = await import("../src/config.js");
    expect(() => loadConfig()).toThrow(/EMAIL_PORT/);
  });

  it("throws when SMTP_PORT override is out of range", async () => {
    Object.assign(process.env, { ...requiredEnv, SMTP_PORT: "99999" });
    const { loadConfig } = await import("../src/config.js");
    expect(() => loadConfig()).toThrow(/SMTP_PORT/);
  });
});
