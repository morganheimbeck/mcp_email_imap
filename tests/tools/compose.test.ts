import { describe, expect, it, vi } from "vitest";
import type { SmtpClient } from "../../src/smtp-client.js";

function makeSmtpMock(overrides: Partial<SmtpClient> = {}): SmtpClient {
  return {
    verify: vi.fn(),
    sendMail: vi.fn().mockResolvedValue("<sent-id@example.com>"),
    ...overrides,
  } as unknown as SmtpClient;
}

describe("create_draft handler", () => {
  it("returns a Draft object without sending", async () => {
    const smtp = makeSmtpMock();
    const { handleCreateDraft } = await import("../../src/tools/compose.js");
    const draft = await handleCreateDraft({
      to: ["recipient@example.com"],
      subject: "Test",
      text: "Hello",
    });
    expect(draft.to).toEqual(["recipient@example.com"]);
    expect(draft.subject).toBe("Test");
    expect(smtp.sendMail).not.toHaveBeenCalled();
  });

  it("throws when to is empty", async () => {
    const { handleCreateDraft } = await import("../../src/tools/compose.js");
    await expect(handleCreateDraft({ to: [], subject: "Test" })).rejects.toThrow(/to/i);
  });

  it("throws when subject is missing", async () => {
    const { handleCreateDraft } = await import("../../src/tools/compose.js");
    await expect(handleCreateDraft({ to: ["a@b.com"], subject: "" })).rejects.toThrow(/subject/i);
  });
});

describe("send_email handler", () => {
  it("sends email when confirmed: true and returns messageId", async () => {
    const smtp = makeSmtpMock();
    const { handleSendEmail } = await import("../../src/tools/compose.js");
    const result = await handleSendEmail(smtp, {
      to: ["recipient@example.com"],
      subject: "Test",
      text: "Hello",
      confirmed: true,
    });
    expect(smtp.sendMail).toHaveBeenCalledOnce();
    expect(result.messageId).toBe("<sent-id@example.com>");
  });

  it("throws when confirmed is false", async () => {
    const smtp = makeSmtpMock();
    const { handleSendEmail } = await import("../../src/tools/compose.js");
    await expect(
      handleSendEmail(smtp, {
        to: ["recipient@example.com"],
        subject: "Test",
        text: "Hello",
        confirmed: false,
      }),
    ).rejects.toThrow(/confirmed/i);
  });

  it("throws when confirmed is missing", async () => {
    const smtp = makeSmtpMock();
    const { handleSendEmail } = await import("../../src/tools/compose.js");
    await expect(
      handleSendEmail(smtp, {
        to: ["recipient@example.com"],
        subject: "Test",
        text: "Hello",
      } as never),
    ).rejects.toThrow(/confirmed/i);
  });

  it("throws when to is empty", async () => {
    const smtp = makeSmtpMock();
    const { handleSendEmail } = await import("../../src/tools/compose.js");
    await expect(
      handleSendEmail(smtp, { to: [], subject: "Test", confirmed: true }),
    ).rejects.toThrow(/to/i);
  });
});
