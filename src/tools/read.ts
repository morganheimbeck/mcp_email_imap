import type { ImapClient } from "../imap-client.js";
import type { EmailMessage, EmailSummary } from "../types.js";

export interface ListEmailsInput {
  folder?: string;
  limit?: number;
}

export interface SearchEmailsInput {
  folder?: string;
  from?: string;
  subject?: string;
  since?: string;
  before?: string;
  limit?: number;
}

export interface ReadEmailInput {
  folder?: string;
  uid: string;
}

export async function handleListEmails(
  imap: ImapClient,
  input: ListEmailsInput,
): Promise<EmailSummary[]> {
  return imap.listEmails(input.folder ?? "INBOX", input.limit ?? 20);
}

export async function handleSearchEmails(
  imap: ImapClient,
  input: SearchEmailsInput,
): Promise<EmailSummary[]> {
  const criteria: Parameters<ImapClient["searchEmails"]>[1] = {};
  if (input.from) criteria.from = input.from;
  if (input.subject) criteria.subject = input.subject;
  if (input.since) criteria.since = new Date(input.since);
  if (input.before) criteria.before = new Date(input.before);
  return imap.searchEmails(input.folder ?? "INBOX", criteria, input.limit ?? 20);
}

export async function handleReadEmail(
  imap: ImapClient,
  input: ReadEmailInput,
): Promise<EmailMessage> {
  if (!input.uid) throw new Error("uid is required");
  return imap.readEmail(input.folder ?? "INBOX", input.uid);
}
