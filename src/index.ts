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
  "List recent or unread emails with sender, subject, and date",
  {
    folder: z.string().optional().describe("Mailbox folder (default: INBOX)"),
    limit: z.number().int().min(1).max(100).optional().describe("Max results (default: 20)"),
  },
  async ({ folder, limit }) => {
    const summaries = await handleListEmails(imap, { folder, limit });
    return { content: [{ type: "text", text: JSON.stringify(summaries, null, 2) }] };
  },
);

server.tool(
  "search_emails",
  "Search emails by sender, subject, or date range",
  {
    folder: z.string().optional().describe("Mailbox folder (default: INBOX)"),
    from: z.string().optional().describe("Filter by sender address"),
    subject: z.string().optional().describe("Filter by subject (substring)"),
    since: z.string().optional().describe("ISO date — messages on or after this date"),
    before: z.string().optional().describe("ISO date — messages before this date"),
    limit: z.number().int().min(1).max(100).optional().describe("Max results (default: 20)"),
  },
  async (input) => {
    const summaries = await handleSearchEmails(imap, input);
    return { content: [{ type: "text", text: JSON.stringify(summaries, null, 2) }] };
  },
);

server.tool(
  "read_email",
  "Get full body and headers of a specific message by UID",
  {
    folder: z.string().optional().describe("Mailbox folder (default: INBOX)"),
    uid: z.string().describe("Message UID"),
  },
  async ({ folder, uid }) => {
    const message = await handleReadEmail(imap, { folder, uid });
    return { content: [{ type: "text", text: JSON.stringify(message, null, 2) }] };
  },
);

server.tool("get_folders", "List all mailbox folders and labels", {}, async () => {
  const folders = await handleGetFolders(imap);
  return { content: [{ type: "text", text: JSON.stringify(folders, null, 2) }] };
});

server.tool(
  "create_draft",
  "Compose a draft email — does NOT send",
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
  "Send an email. Requires confirmed: true to prevent accidental sends.",
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
  "Move a message to another folder (use Trash path to delete safely)",
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
  "Mark one or more messages as read",
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
  "Mark one or more messages as unread",
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
