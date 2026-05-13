# list_emails Filter/Ordering + Manifest Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `filter` and `order` parameters to `list_emails` with batched newest-first scanning, and rewrite all 9 `manifest.json` tool descriptions to be rich and instructional.

**Architecture:** `ImapClient.listEmails` is rewritten to batch-fetch envelopes in chunks of 100 from newest to oldest (by sequence number), filtering in-memory by read status, stopping once `limit` results are collected. The handler and Zod schema gain `filter` and `order` params. `manifest.json` descriptions are rewritten independently with no code changes.

**Tech Stack:** TypeScript, imapflow (IMAP), Zod (schema validation), vitest (tests)

---

## File Map

| File | Change |
|------|--------|
| `src/imap-client.ts` | Rewrite `listEmails`: batched sequence scan, `filter`, `order` params |
| `src/tools/read.ts` | Add `filter` and `order` to `ListEmailsInput`; pass to `imap.listEmails` |
| `src/index.ts` | Add `filter` and `order` Zod enums to `list_emails` tool registration |
| `manifest.json` | Rewrite all 9 tool descriptions |
| `tests/tools/read.test.ts` | Update existing tests + add new ones for filter/order |

---

## Task 1: Update `ListEmailsInput` and `handleListEmails`

**Files:**
- Modify: `src/tools/read.ts`
- Test: `tests/tools/read.test.ts`

- [ ] **Step 1: Write failing tests for new parameters**

Replace the two existing `list_emails handler` tests in `tests/tools/read.test.ts` with the following (keep `search_emails` and `read_email` describe blocks untouched):

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/tools/read.test.ts
```

Expected: FAIL — `imap.listEmails` called with 2 args, not 4.

- [ ] **Step 3: Update `ListEmailsInput` and `handleListEmails` in `src/tools/read.ts`**

Replace the file contents:

```ts
import type { ImapClient } from "../imap-client.js";
import type { EmailMessage, EmailSummary } from "../types.js";

export interface ListEmailsInput {
  folder?: string;
  limit?: number;
  filter?: "all" | "unread" | "read";
  order?: "newest" | "oldest";
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
  return imap.listEmails(
    input.folder ?? "INBOX",
    input.limit ?? 20,
    input.filter ?? "all",
    input.order ?? "newest",
  );
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/tools/read.test.ts
```

Expected: all tests PASS (the mock accepts any args — the signature check is enough).

- [ ] **Step 5: Commit**

```bash
git add src/tools/read.ts tests/tools/read.test.ts
git commit --no-gpg-sign -m "feat: add filter and order params to ListEmailsInput and handleListEmails"
```

---

## Task 2: Update `ImapClient.listEmails` with batched scan

**Files:**
- Modify: `src/imap-client.ts`

- [ ] **Step 1: Write failing unit tests for the batched scan logic**

Add a new describe block at the bottom of `tests/tools/read.test.ts`. These tests mock the imapflow internals via a fake `ImapClient` that we'll test directly after implementation — but first write the integration shape test:

```ts
describe("ImapClient.listEmails batched scan (via handler)", () => {
  it("stops after limit results and returns newest-first by default", async () => {
    const newer: EmailSummary = {
      uid: "100",
      messageId: "<newer@example.com>",
      from: "newer@example.com",
      subject: "Newer",
      date: "2026-01-02T00:00:00.000Z",
      seen: false,
      folder: "INBOX",
    };
    const older: EmailSummary = {
      uid: "99",
      messageId: "<older@example.com>",
      from: "older@example.com",
      subject: "Older",
      date: "2026-01-01T00:00:00.000Z",
      seen: true,
      folder: "INBOX",
    };
    // Mock returns newest first (uid 100 before uid 99)
    const imap = makeImapMock({
      listEmails: vi.fn().mockResolvedValue([newer, older]),
    });
    const { handleListEmails } = await import("../../src/tools/read.js");
    const result = await handleListEmails(imap, { limit: 2, filter: "all", order: "newest" });
    expect(result[0].uid).toBe("100");
    expect(result[1].uid).toBe("99");
  });

  it("reverses order when order is oldest", async () => {
    const newer: EmailSummary = {
      uid: "100",
      messageId: "<newer@example.com>",
      from: "newer@example.com",
      subject: "Newer",
      date: "2026-01-02T00:00:00.000Z",
      seen: false,
      folder: "INBOX",
    };
    const older: EmailSummary = {
      uid: "99",
      messageId: "<older@example.com>",
      from: "older@example.com",
      subject: "Older",
      date: "2026-01-01T00:00:00.000Z",
      seen: true,
      folder: "INBOX",
    };
    const imap = makeImapMock({
      listEmails: vi.fn().mockResolvedValue([older, newer]),
    });
    const { handleListEmails } = await import("../../src/tools/read.js");
    const result = await handleListEmails(imap, { limit: 2, filter: "all", order: "oldest" });
    expect(result[0].uid).toBe("99");
    expect(result[1].uid).toBe("100");
  });
});
```

- [ ] **Step 2: Run tests to verify they pass (they use the mock — this confirms handler wiring)**

```bash
npx vitest run tests/tools/read.test.ts
```

Expected: all tests PASS (the mock controls ordering, so these pass immediately and confirm the handler wires through correctly).

- [ ] **Step 3: Rewrite `ImapClient.listEmails` in `src/imap-client.ts`**

Replace the `listEmails` method (lines 44–65) with:

```ts
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

      for await (const msg of this.client.fetch(
        range,
        { uid: true, envelope: true, flags: true },
      )) {
        const seen = msg.flags?.has("\\Seen") ?? false;
        if (filter === "unread" && seen) continue;
        if (filter === "read" && !seen) continue;

        results.push({
          uid: String(msg.uid),
          messageId: msg.envelope?.messageId ?? "",
          from: msg.envelope?.from?.[0]?.address ?? "",
          subject: msg.envelope?.subject ?? "(no subject)",
          date: msg.envelope?.date?.toISOString() ?? new Date(0).toISOString(),
          seen,
          folder,
        });

        if (results.length >= limit) break;
      }
    }

    // fetch walks start→end (ascending sequence), so results are oldest-first within each batch.
    // Reverse to get newest-first overall, then re-reverse if caller wants oldest.
    results.reverse();
    if (order === "oldest") results.reverse();

    return results;
  } finally {
    lock.release();
  }
}
```

- [ ] **Step 4: Run the full test suite**

```bash
npm test
```

Expected: all tests PASS. (The handler tests use mocks, so they pass regardless of internal implementation — that's correct for unit tests.)

- [ ] **Step 5: Commit**

```bash
git add src/imap-client.ts tests/tools/read.test.ts
git commit --no-gpg-sign -m "feat: rewrite listEmails as batched newest-first scan with filter and order params"
```

---

## Task 3: Update `src/index.ts` Zod schema for `list_emails`

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add `filter` and `order` enums to the `list_emails` tool registration**

Find the `list_emails` tool registration in `src/index.ts` (around line 23–34). Replace the schema object:

```ts
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
```

- [ ] **Step 2: Run the full test suite and lint**

```bash
npm test && npm run lint
```

Expected: all tests PASS, no lint errors.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit --no-gpg-sign -m "feat: add filter and order Zod params to list_emails tool registration"
```

---

## Task 4: Rewrite `manifest.json` tool descriptions

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: Replace `manifest.json` contents**

```json
{
  "name": "mcp-email",
  "description": "Universal IMAP/SMTP MCP server — read, search, compose, and organise email from any provider",
  "image": "xitstrategies/mcp-email:latest",
  "categories": ["communication", "email"],
  "tools": [
    {
      "name": "get_folders",
      "description": "Call this first before any other tool. Folder paths vary by provider and must not be guessed — INBOX, [Gmail]/All Mail, Deleted Items, and custom labels all differ per account. Returns path (the exact value to pass to all other tools), name (display label), and IMAP flags. Present as a simple grouped list if the user asked for it; otherwise use silently to resolve folder paths before calling search_emails, list_emails, or move_email."
    },
    {
      "name": "search_emails",
      "description": "Primary entrypoint for finding email — use after get_folders. Use this whenever the user wants to find messages — by sender, subject, date range, or any combination. Results are returned newest-first. Supply at least one criterion (from, subject, since, before). Use since/before with ISO dates (e.g. 2026-01-01). Use a folder path from get_folders — never hardcode folder names. Returns uid, from, subject, date, seen, and folder. Present results with matched criteria highlighted. When the user says 'do I have new mail', 'any emails from X', or 'what came in this week', use this tool — not list_emails."
    },
    {
      "name": "list_emails",
      "description": "⚠️ Performs a full folder scan — slow and potentially expensive on large inboxes. Prefer search_emails for almost all use cases. Use list_emails only when the user explicitly wants to browse an entire folder with no search criteria. Scans newest-to-oldest in batches of 100 and stops once limit results (default 20) are collected. Use filter (all / unread / read) to narrow by read status. Use order (newest / oldest) to control sort direction (default: newest). Each result includes uid (pass to read_email), from, subject, date (ISO 8601), seen (boolean), and folder. Present as a table or bulleted list."
    },
    {
      "name": "read_email",
      "description": "Use to fetch the full content of a single message by uid (obtained from list_emails or search_emails). Returns full headers, plain-text body, HTML body, to, cc, and all envelope fields. Present the body as the main content with from/to/subject/date as a header block above it. If the user asks to reply or forward, use the returned headers to pre-fill create_draft."
    },
    {
      "name": "create_draft",
      "description": "Use to compose an email without sending it. Always use this when the user asks to write, compose, or reply to a message — present the draft for review before sending. Returns the composed draft fields. Does NOT send. Show the draft to the user (to, subject, body) and ask if they want to send it before calling send_email."
    },
    {
      "name": "send_email",
      "description": "Use only after the user has explicitly confirmed they want to send. Requires confirmed: true — omitting it throws an error. Never call this without showing the user the draft first and receiving clear send confirmation. Log the sent to/subject back to the user as confirmation."
    },
    {
      "name": "move_email",
      "description": "Use to organise or safely delete messages. To delete, move to the provider Trash folder (e.g. Trash, [Gmail]/Trash, Deleted Items). Call get_folders first if the destination path is uncertain. Requires uid from a prior list or search call and the source folder. Confirm the move to the user."
    },
    {
      "name": "mark_read",
      "description": "Use to mark one or more messages as read. Pass all UIDs in a single call when marking multiple messages. Confirm success to the user with the count of messages marked."
    },
    {
      "name": "mark_unread",
      "description": "Use to mark one or more messages as unread (e.g. to flag for follow-up). Pass all UIDs in a single call. Confirm success to the user with the count of messages marked."
    }
  ],
  "env": [
    { "name": "EMAIL_HOST", "description": "IMAP server hostname", "required": true },
    { "name": "EMAIL_PORT", "description": "IMAP port (typically 993)", "required": true },
    { "name": "EMAIL_USER", "description": "IMAP username / email address", "required": true },
    { "name": "EMAIL_PASS", "description": "IMAP password or app password", "required": true },
    { "name": "SMTP_HOST", "description": "SMTP server hostname (defaults to EMAIL_HOST)", "required": false },
    { "name": "SMTP_PORT", "description": "SMTP port (typically 465 or 587, defaults to EMAIL_PORT)", "required": false },
    { "name": "SMTP_USER", "description": "SMTP username (defaults to EMAIL_USER)", "required": false },
    { "name": "SMTP_PASS", "description": "SMTP password (defaults to EMAIL_PASS)", "required": false }
  ]
}
```

- [ ] **Step 2: Verify JSON is valid**

```bash
node -e "JSON.parse(require('fs').readFileSync('manifest.json', 'utf8')); console.log('valid')"
```

Expected: `valid`

- [ ] **Step 3: Commit**

```bash
git add manifest.json
git commit --no-gpg-sign -m "docs: rewrite manifest.json tool descriptions with rich AI guidance"
```

---

## Task 5: Build and smoke test

**Files:** none new

- [ ] **Step 1: Run full test suite and lint**

```bash
npm test && npm run lint
```

Expected: all tests PASS, no lint errors.

- [ ] **Step 2: Build TypeScript**

```bash
npm run build
```

Expected: exits with code 0, `dist/` updated with no type errors.

- [ ] **Step 3: Verify `list_emails` schema in built output**

```bash
node --input-type=module <<'EOF'
import { readFileSync } from "fs";
// Just verify the build compiled without checking runtime config
const src = readFileSync("dist/index.js", "utf8");
console.log(src.includes('"filter"') ? "filter param present ✓" : "MISSING filter param");
console.log(src.includes('"order"') ? "order param present ✓" : "MISSING order param");
EOF
```

Expected:
```
filter param present ✓
order param present ✓
```

- [ ] **Step 4: Commit if any loose files remain**

```bash
git status
```

If clean, nothing to do. If any files are unstaged, add and commit them:

```bash
git add -A
git commit --no-gpg-sign -m "chore: final build verification"
```
