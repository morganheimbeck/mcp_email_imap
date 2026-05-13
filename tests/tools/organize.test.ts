import { describe, expect, it, vi } from "vitest";
import type { ImapClient } from "../../src/imap-client.js";
import type { Folder } from "../../src/types.js";

function makeImapMock(overrides: Partial<ImapClient> = {}): ImapClient {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    listFolders: vi.fn(),
    listEmails: vi.fn(),
    searchEmails: vi.fn(),
    readEmail: vi.fn(),
    moveEmail: vi.fn().mockResolvedValue(undefined),
    setFlags: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ImapClient;
}

const mockFolders: Folder[] = [
  { path: "INBOX", name: "INBOX", delimiter: "/", flags: [] },
  { path: "Trash", name: "Trash", delimiter: "/", flags: ["\\Trash"] },
];

describe("get_folders handler", () => {
  it("returns list of folders from ImapClient", async () => {
    const imap = makeImapMock({ listFolders: vi.fn().mockResolvedValue(mockFolders) });
    const { handleGetFolders } = await import("../../src/tools/organize.js");
    const result = await handleGetFolders(imap);
    expect(result).toHaveLength(2);
    expect(result[0].path).toBe("INBOX");
  });
});

describe("move_email handler", () => {
  it("calls moveEmail with correct args", async () => {
    const imap = makeImapMock();
    const { handleMoveEmail } = await import("../../src/tools/organize.js");
    await handleMoveEmail(imap, { folder: "INBOX", uid: "10", destination: "Trash" });
    expect(imap.moveEmail).toHaveBeenCalledWith("INBOX", "10", "Trash");
  });

  it("throws when uid is missing", async () => {
    const imap = makeImapMock();
    const { handleMoveEmail } = await import("../../src/tools/organize.js");
    await expect(
      handleMoveEmail(imap, { folder: "INBOX", uid: "", destination: "Trash" }),
    ).rejects.toThrow(/uid/i);
  });

  it("throws when destination is missing", async () => {
    const imap = makeImapMock();
    const { handleMoveEmail } = await import("../../src/tools/organize.js");
    await expect(
      handleMoveEmail(imap, { folder: "INBOX", uid: "10", destination: "" }),
    ).rejects.toThrow(/destination/i);
  });
});

describe("mark_read handler", () => {
  it("calls setFlags with add \\Seen", async () => {
    const imap = makeImapMock();
    const { handleMarkRead } = await import("../../src/tools/organize.js");
    await handleMarkRead(imap, { folder: "INBOX", uids: ["1", "2"] });
    expect(imap.setFlags).toHaveBeenCalledWith("INBOX", ["1", "2"], "\\Seen", "add");
  });
});

describe("mark_unread handler", () => {
  it("calls setFlags with remove \\Seen", async () => {
    const imap = makeImapMock();
    const { handleMarkUnread } = await import("../../src/tools/organize.js");
    await handleMarkUnread(imap, { folder: "INBOX", uids: ["3"] });
    expect(imap.setFlags).toHaveBeenCalledWith("INBOX", ["3"], "\\Seen", "remove");
  });
});
