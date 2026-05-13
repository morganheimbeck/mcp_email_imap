import type { ImapClient } from "../imap-client.js";
import { logAction } from "../logger.js";
import type { Folder } from "../types.js";

export interface MoveEmailInput {
  folder: string;
  uid: string;
  destination: string;
}

export interface FlagInput {
  folder: string;
  uids: string[];
}

export async function handleGetFolders(imap: ImapClient): Promise<Folder[]> {
  return imap.listFolders();
}

export async function handleMoveEmail(imap: ImapClient, input: MoveEmailInput): Promise<void> {
  if (!input.uid) throw new Error("uid is required");
  if (!input.destination) throw new Error("destination is required");
  await imap.moveEmail(input.folder, input.uid, input.destination);
  logAction("move_email", { folder: input.folder, uid: input.uid, destination: input.destination });
}

export async function handleMarkRead(imap: ImapClient, input: FlagInput): Promise<void> {
  await imap.setFlags(input.folder, input.uids, "\\Seen", "add");
  logAction("mark_read", { folder: input.folder, uids: input.uids });
}

export async function handleMarkUnread(imap: ImapClient, input: FlagInput): Promise<void> {
  await imap.setFlags(input.folder, input.uids, "\\Seen", "remove");
  logAction("mark_unread", { folder: input.folder, uids: input.uids });
}
