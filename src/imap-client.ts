import { ImapFlow, type MailboxLockObject } from "imapflow";
import type { Config } from "./config.js";
import type { EmailMessage, EmailSummary, Folder } from "./types.js";

export class ImapClient {
  private client: ImapFlow;
  private connected = false;

  constructor(config: Config["imap"]) {
    this.client = new ImapFlow({
      host: config.host,
      port: config.port,
      secure: true,
      auth: { user: config.user, pass: config.pass },
      logger: false,
    });
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      await this.client.connect();
      this.connected = true;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.client.logout();
      this.connected = false;
    }
  }

  async listFolders(): Promise<Folder[]> {
    await this.connect();
    const tree = await this.client.list();
    return tree.map((mb) => ({
      path: mb.path,
      name: mb.name,
      delimiter: mb.delimiter ?? "/",
      flags: [...(mb.flags ?? [])],
    }));
  }

  async listEmails(
    folder: string,
    limit: number,
    filter: "all" | "unread" | "read",
    order: "newest" | "oldest",
  ): Promise<EmailSummary[]> {
    await this.connect();
    const lock: MailboxLockObject = await this.client.getMailboxLock(folder);
    try {
      const total: number = this.client.mailbox?.exists ?? 0;
      if (total === 0) return [];

      const BATCH_SIZE = 100;
      const results: EmailSummary[] = [];
      let end = total;

      while (end > 0 && results.length < limit) {
        const start = Math.max(1, end - BATCH_SIZE + 1);
        const range = `${start}:${end}`;
        end = start - 1;

        const batch: EmailSummary[] = [];
        for await (const msg of this.client.fetch(
          range,
          { uid: true, envelope: true, flags: true },
        )) {
          const seen = msg.flags?.has("\\Seen") ?? false;
          if (filter === "unread" && seen) continue;
          if (filter === "read" && !seen) continue;

          batch.push({
            uid: String(msg.uid),
            messageId: msg.envelope?.messageId ?? "",
            from: msg.envelope?.from?.[0]?.address ?? "",
            subject: msg.envelope?.subject ?? "(no subject)",
            date: msg.envelope?.date?.toISOString() ?? new Date(0).toISOString(),
            seen,
            folder,
          });
        }

        // Batch was fetched oldest-first; reverse to newest-first before appending.
        batch.reverse();
        for (const item of batch) {
          results.push(item);
          if (results.length >= limit) break;
        }
      }

      if (order === "oldest") results.reverse();

      return results;
    } finally {
      lock.release();
    }
  }

  async searchEmails(
    folder: string,
    criteria: { from?: string; subject?: string; since?: Date; before?: Date },
    limit: number,
  ): Promise<EmailSummary[]> {
    await this.connect();
    const lock: MailboxLockObject = await this.client.getMailboxLock(folder);
    try {
      const query: Record<string, unknown> = {};
      if (criteria.from) query.from = criteria.from;
      if (criteria.subject) query.subject = criteria.subject;
      if (criteria.since) query.since = criteria.since;
      if (criteria.before) query.before = criteria.before;

      const searchResult = await this.client.search(query, { uid: true });
      const uids = Array.isArray(searchResult) ? searchResult : [];
      const fetchUids = uids.slice(-limit);
      const messages: EmailSummary[] = [];
      for await (const msg of this.client.fetch(
        fetchUids,
        { uid: true, envelope: true, flags: true },
        { uid: true },
      )) {
        messages.push({
          uid: String(msg.uid),
          messageId: msg.envelope?.messageId ?? "",
          from: msg.envelope?.from?.[0]?.address ?? "",
          subject: msg.envelope?.subject ?? "(no subject)",
          date: msg.envelope?.date?.toISOString() ?? new Date(0).toISOString(),
          seen: msg.flags?.has("\\Seen") ?? false,
          folder,
        });
      }
      return messages;
    } finally {
      lock.release();
    }
  }

  async readEmail(folder: string, uid: string): Promise<EmailMessage> {
    await this.connect();
    const lock: MailboxLockObject = await this.client.getMailboxLock(folder);
    try {
      let found: EmailMessage | null = null;
      for await (const msg of this.client.fetch(
        [Number(uid)],
        { uid: true, envelope: true, flags: true, bodyStructure: true, source: true },
        { uid: true },
      )) {
        const source = msg.source?.toString() ?? "";
        const [rawHeaders, ...bodyParts] = source.split("\r\n\r\n");
        const headers: Record<string, string> = {};
        for (const line of (rawHeaders ?? "").split("\r\n")) {
          const colon = line.indexOf(":");
          if (colon > 0) {
            headers[line.slice(0, colon).toLowerCase().trim()] = line.slice(colon + 1).trim();
          }
        }
        found = {
          uid: String(msg.uid),
          messageId: msg.envelope?.messageId ?? "",
          from: msg.envelope?.from?.[0]?.address ?? "",
          to: (msg.envelope?.to ?? []).map((a) => a.address ?? ""),
          cc: (msg.envelope?.cc ?? []).map((a) => a.address ?? ""),
          subject: msg.envelope?.subject ?? "(no subject)",
          date: msg.envelope?.date?.toISOString() ?? new Date(0).toISOString(),
          seen: msg.flags?.has("\\Seen") ?? false,
          folder,
          textBody: bodyParts.join("\r\n\r\n"),
          htmlBody: "",
          headers,
        };
      }
      if (!found) throw new Error(`Message UID ${uid} not found in ${folder}`);
      return found;
    } finally {
      lock.release();
    }
  }

  async moveEmail(folder: string, uid: string, destination: string): Promise<void> {
    await this.connect();
    const lock: MailboxLockObject = await this.client.getMailboxLock(folder);
    try {
      await this.client.messageMove([Number(uid)], destination, { uid: true });
    } finally {
      lock.release();
    }
  }

  async setFlags(
    folder: string,
    uids: string[],
    flag: "\\Seen",
    action: "add" | "remove",
  ): Promise<void> {
    await this.connect();
    const lock: MailboxLockObject = await this.client.getMailboxLock(folder);
    try {
      const numUids = uids.map(Number);
      if (action === "add") {
        await this.client.messageFlagsAdd(numUids, [flag], { uid: true });
      } else {
        await this.client.messageFlagsRemove(numUids, [flag], { uid: true });
      }
    } finally {
      lock.release();
    }
  }
}
