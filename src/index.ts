import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { loadConfig } from "./config.js";
import { ImapClient } from "./imap-client.js";
import { SmtpClient } from "./smtp-client.js";
import { handleCreateDraft, handleSendEmail } from "./tools/compose.js";
import {
  handleGetFolders,
  handleMarkRead,
  handleMarkUnread,
  handleMoveEmail,
} from "./tools/organize.js";
import { handleListEmails, handleReadEmail, handleSearchEmails } from "./tools/read.js";

const config = loadConfig();
const imap = new ImapClient(config.imap);
const smtp = new SmtpClient(config.smtp);

const server = new McpServer({ name: "mcp-email", version: "0.1.0" });

server.tool(
  "list_emails",
  "⚠️ Performs a full folder scan — slow and potentially expensive on large inboxes. Prefer search_emails for almost all use cases. Use list_emails only when the user explicitly wants to browse an entire folder with no search criteria. Scans newest-to-oldest in batches of 100 and stops once limit results (default 20) are collected. Use filter (all / unread / read) to narrow by read status. Use order (newest / oldest) to control sort direction (default: newest). Each result includes uid (pass to read_email), from, subject, date (ISO 8601), seen (boolean), and folder. Present as a table or bulleted list.",
  {
    folder: z.string().optional().describe("Mailbox folder path from get_folders (default: INBOX)"),
    limit: z.number().int().min(1).max(100).optional().describe("Max results (default: 20)"),
    filter: z
      .enum(["all", "unread", "read"])
      .optional()
      .describe("Read-status filter: all (default), unread, or read"),
    order: z
      .enum(["newest", "oldest"])
      .optional()
      .describe("Sort direction: newest (default) or oldest"),
  },
  async ({ folder, limit, filter, order }) => {
    const summaries = await handleListEmails(imap, { folder, limit, filter, order });
    return { content: [{ type: "text", text: JSON.stringify(summaries, null, 2) }] };
  },
);

server.tool(
  "search_emails",
  "Primary entrypoint for finding email — use after get_folders. Use this whenever the user wants to find messages — by sender, subject, date range, read status, or any combination. Results are returned newest-first. Supply at least one criterion (from, subject, since, before, seen). Use since/before with ISO dates (e.g. 2026-01-01). Pass seen: false to find unread emails; seen: true for read emails; omit seen to return all. Use a folder path from get_folders — never hardcode folder names. Returns uid, from, subject, date, seen (boolean — false means unread, true means read), and folder. Present results with matched criteria highlighted; mark unread messages visually (e.g. bold subject). When the user says 'do I have new mail', 'any unread emails', 'any emails from X', or 'what came in this week', use this tool — not list_emails.",
  {
    folder: z.string().optional().describe("Mailbox folder path from get_folders (default: INBOX)"),
    from: z.string().optional().describe("Filter by sender address"),
    subject: z.string().optional().describe("Filter by subject (substring)"),
    since: z.string().optional().describe("ISO date — messages on or after this date"),
    before: z.string().optional().describe("ISO date — messages before this date"),
    seen: z.boolean().optional().describe("Filter by read status: false = unread, true = read, omit = all"),
    limit: z.number().int().min(1).max(100).optional().describe("Max results (default: 20)"),
  },
  async (input) => {
    const summaries = await handleSearchEmails(imap, input);
    return { content: [{ type: "text", text: JSON.stringify(summaries, null, 2) }] };
  },
);

server.tool(
  "read_email",
  "Use to fetch the full content of a single message by uid (obtained from list_emails or search_emails). Returns full headers, plain-text body, HTML body, to, cc, and all envelope fields. Present the body as the main content with from/to/subject/date as a header block above it. If the user asks to reply or forward, use the returned headers to pre-fill create_draft.",
  {
    folder: z.string().optional().describe("Mailbox folder (default: INBOX)"),
    uid: z.string().describe("Message UID"),
  },
  async ({ folder, uid }) => {
    const message = await handleReadEmail(imap, { folder, uid });
    return { content: [{ type: "text", text: JSON.stringify(message, null, 2) }] };
  },
);

server.tool("get_folders", "Call this first before any other tool. Folder paths vary by provider and must not be guessed — INBOX, [Gmail]/All Mail, Deleted Items, and custom labels all differ per account. Returns path (the exact value to pass to all other tools), name (display label), and IMAP flags. Present as a simple grouped list if the user asked for it; otherwise use silently to resolve folder paths before calling search_emails, list_emails, or move_email.", {}, async () => {
  const folders = await handleGetFolders(imap);
  return { content: [{ type: "text", text: JSON.stringify(folders, null, 2) }] };
});

server.tool(
  "create_draft",
  "Use to compose an email without sending it. Always use this when the user asks to write, compose, or reply to a message — present the draft for review before sending. Returns the composed draft fields. Does NOT send. Show the draft to the user (to, subject, body) and ask if they want to send it before calling send_email.",
  {
    to: z.array(z.string().email()).describe("Recipient addresses"),
    cc: z.array(z.string().email()).optional().describe("CC addresses"),
    bcc: z.array(z.string().email()).optional().describe("BCC addresses"),
    subject: z.string().describe("Email subject"),
    text: z.string().optional().describe("Plain-text body"),
    html: z.string().optional().describe("HTML body"),
  },
  async (input) => {
    const draft = await handleCreateDraft(input);
    return { content: [{ type: "text", text: JSON.stringify(draft, null, 2) }] };
  },
);

server.tool(
  "send_email",
  "Use only after the user has explicitly confirmed they want to send. Requires confirmed: true — omitting it throws an error. Never call this without showing the user the draft first and receiving clear send confirmation. Log the sent to/subject back to the user as confirmation.",
  {
    to: z.array(z.string().email()).describe("Recipient addresses"),
    cc: z.array(z.string().email()).optional().describe("CC addresses"),
    bcc: z.array(z.string().email()).optional().describe("BCC addresses"),
    subject: z.string().describe("Email subject"),
    text: z.string().optional().describe("Plain-text body"),
    html: z.string().optional().describe("HTML body"),
    confirmed: z.boolean().describe("Must be true — protects against accidental sends"),
  },
  async (input) => {
    const result = await handleSendEmail(smtp, input);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "move_email",
  "Use to organise or safely delete messages. To delete, move to the provider Trash folder (e.g. Trash, [Gmail]/Trash, Deleted Items). Call get_folders first if the destination path is uncertain. Requires uid from a prior list or search call and the source folder. Confirm the move to the user.",
  {
    folder: z.string().describe("Source folder"),
    uid: z.string().describe("Message UID"),
    destination: z.string().describe("Destination folder path"),
  },
  async ({ folder, uid, destination }) => {
    await handleMoveEmail(imap, { folder, uid, destination });
    return { content: [{ type: "text", text: "Message moved successfully" }] };
  },
);

server.tool(
  "mark_read",
  "Use to mark one or more messages as read. Pass all UIDs in a single call when marking multiple messages. Confirm success to the user with the count of messages marked.",
  {
    folder: z.string().describe("Mailbox folder"),
    uids: z.array(z.string()).describe("Message UIDs to mark as read"),
  },
  async ({ folder, uids }) => {
    await handleMarkRead(imap, { folder, uids });
    return { content: [{ type: "text", text: "Marked as read" }] };
  },
);

server.tool(
  "mark_unread",
  "Use to mark one or more messages as unread (e.g. to flag for follow-up). Pass all UIDs in a single call. Confirm success to the user with the count of messages marked.",
  {
    folder: z.string().describe("Mailbox folder"),
    uids: z.array(z.string()).describe("Message UIDs to mark as unread"),
  },
  async ({ folder, uids }) => {
    await handleMarkUnread(imap, { folder, uids });
    return { content: [{ type: "text", text: "Marked as unread" }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
