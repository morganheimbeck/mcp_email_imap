import { describe, expect, it, vi } from "vitest";
import type { ImapClient } from "../../src/imap-client.js";
import type { EmailMessage, EmailSummary } from "../../src/types.js";

function makeImapMock(overrides: Partial<ImapClient> = {}): ImapClient {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    listFolders: vi.fn(),
    listEmails: vi.fn(),
    searchEmails: vi.fn(),
    readEmail: vi.fn(),
    moveEmail: vi.fn(),
    setFlags: vi.fn(),
    ...overrides,
  } as unknown as ImapClient;
}

const mockSummary: EmailSummary = {
  uid: "42",
  messageId: "<abc@example.com>",
  from: "sender@example.com",
  subject: "Hello",
  date: "2024-01-01T00:00:00.000Z",
  seen: false,
  folder: "INBOX",
};

const mockMessage: EmailMessage = {
  ...mockSummary,
  to: ["me@example.com"],
  cc: [],
  textBody: "Body text",
  htmlBody: "",
  headers: { "content-type": "text/plain" },
};

describe("list_emails handler", () => {
  it("passes folder, limit, filter, and order to ImapClient.listEmails", async () => {
    const imap = makeImapMock({ listEmails: vi.fn().mockResolvedValue([mockSummary]) });
    const { handleListEmails } = await import("../../src/tools/read.js");
    const result = await handleListEmails(imap, {
      folder: "INBOX",
      limit: 10,
      filter: "unread",
      order: "oldest",
    });
    expect(result).toHaveLength(1);
    expect(imap.listEmails).toHaveBeenCalledWith("INBOX", 10, "unread", "oldest");
  });

  it("defaults folder to INBOX, limit to 20, filter to all, order to newest", async () => {
    const imap = makeImapMock({ listEmails: vi.fn().mockResolvedValue([]) });
    const { handleListEmails } = await import("../../src/tools/read.js");
    await handleListEmails(imap, {});
    expect(imap.listEmails).toHaveBeenCalledWith("INBOX", 20, "all", "newest");
  });
});

describe("search_emails handler", () => {
  it("passes criteria to ImapClient.searchEmails", async () => {
    const imap = makeImapMock({ searchEmails: vi.fn().mockResolvedValue([mockSummary]) });
    const { handleSearchEmails } = await import("../../src/tools/read.js");
    const result = await handleSearchEmails(imap, {
      folder: "INBOX",
      from: "sender@example.com",
      limit: 10,
    });
    expect(result).toHaveLength(1);
    expect(imap.searchEmails).toHaveBeenCalledWith(
      "INBOX",
      expect.objectContaining({ from: "sender@example.com" }),
      10,
    );
  });
});

describe("read_email handler", () => {
  it("returns full EmailMessage from ImapClient.readEmail", async () => {
    const imap = makeImapMock({ readEmail: vi.fn().mockResolvedValue(mockMessage) });
    const { handleReadEmail } = await import("../../src/tools/read.js");
    const result = await handleReadEmail(imap, { folder: "INBOX", uid: "42" });
    expect(result.textBody).toBe("Body text");
    expect(imap.readEmail).toHaveBeenCalledWith("INBOX", "42");
  });

  it("throws when uid is missing", async () => {
    const imap = makeImapMock();
    const { handleReadEmail } = await import("../../src/tools/read.js");
    await expect(handleReadEmail(imap, { folder: "INBOX", uid: "" })).rejects.toThrow(/uid/i);
  });
});
