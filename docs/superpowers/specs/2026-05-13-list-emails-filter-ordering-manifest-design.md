# Design: list_emails filter/ordering + manifest documentation

**Date:** 2026-05-13  
**Status:** Approved

## Summary

Three improvements to `mcp-email`:

1. Reposition `search_emails` as the primary AI entrypoint for finding mail
2. Rewrite `list_emails` as a full-folder scan with newest-first batching, a read-status filter, and an optional order parameter — clearly documented as slow/expensive
3. Rewrite `manifest.json` tool descriptions to be rich and instructional for the AI

---

## 1. Tool positioning

The recommended call sequence is:

1. **`get_folders`** — always call first to discover real folder paths before any other tool. Folder names vary by provider (`INBOX`, `Inbox`, `[Gmail]/All Mail`, `Deleted Items`, etc.) and should never be guessed.
2. **`search_emails`** — primary entrypoint for finding messages once folder paths are known. Use for any user intent that involves finding, filtering, or browsing mail.
3. **`list_emails`** — last resort for browsing an entire folder with no criteria. Explicitly documented as slow and expensive; the manifest warns the AI not to use it unless the user specifically requests a full folder browse.

The manifest descriptions for `get_folders` and `search_emails` both reinforce this flow.

---

## 2. `list_emails` — full-folder scan, newest-first, with batching

### Repositioned role

`list_emails` is a full-folder scan utility. It is **not** the default tool for "show me my email" — `search_emails` is. `list_emails` is appropriate when the user explicitly wants to browse an entire folder without criteria.

### New parameters

```
filter?: "all" | "unread" | "read"   // default: "all"
order?:  "newest" | "oldest"         // default: "newest"
```

Added to:
- `ListEmailsInput` interface in `src/tools/read.ts`
- `handleListEmails` in `src/tools/read.ts`
- Zod schema on the `list_emails` tool registration in `src/index.ts`

### Implementation — batched newest-first scan

`ImapClient.listEmails` replaces `fetch("1:*", ...)` with a batched walk from the end of the mailbox:

1. Determine total message count from the selected mailbox (`mailbox.exists`)
2. Walk backward in sequence-number chunks of `BATCH_SIZE = 100`, starting from `*`
3. For each batch, `fetch(`${end}:${start}`, { uid, envelope, flags })` (sequence range, not UIDs)
4. Apply the `filter` in-memory: skip messages that don't match `seen`/`unseen` state
5. Accumulate matching results until `limit` is reached, then stop
6. If `order === "oldest"`, reverse the final result array before returning

This avoids loading all envelopes at once and stops as soon as enough results are collected. For most inboxes the first batch of 100 will satisfy a default limit of 20.

### Edge cases

- Empty mailbox (`mailbox.exists === 0`): return `[]` immediately
- `limit` larger than matching messages: scan completes the full folder and returns all matches
- `order === "oldest"`: reverse the accumulated results before returning

### Signature change

```ts
// before
listEmails(folder: string, limit: number): Promise<EmailSummary[]>

// after
listEmails(
  folder: string,
  limit: number,
  filter: "all" | "unread" | "read",
  order: "newest" | "oldest",
): Promise<EmailSummary[]>
```

---

## 3. `search_emails` — primary entrypoint

No implementation changes. The manifest description is updated to position it as the first tool the AI should reach for when the user wants to find emails. It already uses `search → slice tail → reverse → fetch` (UID-based), so it naturally returns newest-first.

---

## 4. `manifest.json` — rich tool descriptions

Each tool description tells the AI:
- **When to use it** — what user intent maps to this tool
- **Key parameters** — what they control and their defaults
- **Response shape** — what fields come back and what they mean
- **Presentation guidance** — how to format results for the user

### Description rewrites (per tool)

**`list_emails`**
> ⚠️ Performs a full folder scan — slow and potentially expensive on large inboxes. Prefer `search_emails` for almost all use cases. Use `list_emails` only when the user explicitly wants to browse an entire folder with no search criteria. Scans newest-to-oldest in batches of 100 and stops once `limit` results (default 20) are collected. Use `filter` ("all" / "unread" / "read") to narrow by read status. Use `order` ("newest" / "oldest") to control sort direction (default: newest). Each result includes `uid` (pass to `read_email`), `from`, `subject`, `date` (ISO 8601), `seen` (boolean), and `folder`. Present as a table or bulleted list.

**`search_emails`**
> **Primary entrypoint for finding email — use after `get_folders`.** Use this whenever the user wants to find messages — by sender, subject, date range, or any combination. Results are returned newest-first. Supply at least one criterion (`from`, `subject`, `since`, `before`). Use `since`/`before` with ISO dates (e.g. `2026-01-01`). Use a `folder` path from `get_folders` — never hardcode folder names. Returns `uid`, `from`, `subject`, `date`, `seen`, and `folder`. Present results with matched criteria highlighted. When the user says "do I have new mail", "any emails from X", or "what came in this week", use this tool — not `list_emails`.

**`read_email`**
> Use to fetch the full content of a single message by `uid` (obtained from `list_emails` or `search_emails`). Returns full headers, plain-text body, HTML body, to, cc, and all envelope fields. Present the body as the main content with from/to/subject/date as a header block above it. If the user asks to reply or forward, use the returned headers to pre-fill `create_draft`.

**`get_folders`**
> **Call this first before any other tool.** Folder paths vary by provider and must not be guessed — `INBOX`, `[Gmail]/All Mail`, `Deleted Items`, and custom labels are all valid but differ per account. Returns `path` (the exact value to pass to all other tools), `name` (display label), and IMAP flags. Present as a simple grouped list if the user asked for it; otherwise use silently to resolve folder paths before calling `search_emails`, `list_emails`, or `move_email`.

**`create_draft`**
> Use to compose an email without sending it. Always use this when the user asks to write, compose, or reply to a message — present the draft for review before sending. Returns the composed draft fields. Does NOT send. Show the draft to the user (to, subject, body) and ask if they want to send it before calling `send_email`.

**`send_email`**
> Use only after the user has explicitly confirmed they want to send. Requires `confirmed: true` — omitting it throws an error. Never call this without showing the user the draft first and receiving clear send confirmation. Log the sent to/subject back to the user as confirmation.

**`move_email`**
> Use to organise or safely delete messages. To delete, move to the provider Trash folder (e.g. `Trash`, `[Gmail]/Trash`, `Deleted Items`). Call `get_folders` first if the destination path is uncertain. Requires `uid` from a prior list or search call and the source `folder`. Confirm the move to the user.

**`mark_read`**
> Use to mark one or more messages as read. Pass all UIDs in a single call when marking multiple messages. Confirm success to the user with the count of messages marked.

**`mark_unread`**
> Use to mark one or more messages as unread (e.g. to flag for follow-up). Pass all UIDs in a single call. Confirm success to the user with the count of messages marked.

---

## 5. Files changed

| File | Change |
|------|--------|
| `src/imap-client.ts` | `listEmails`: replace `fetch("1:*")` with batched newest-first walk; add `filter` and `order` params |
| `src/tools/read.ts` | Add `filter` and `order` to `ListEmailsInput`; pass to `imap.listEmails` |
| `src/index.ts` | Add `filter` Zod enum and `order` Zod enum to `list_emails` tool registration |
| `manifest.json` | Rewrite all 9 tool descriptions |

---

## 6. Testing

Existing tests in `tests/tools/read.test.ts` cover `handleListEmails`. Tests should be updated/added to assert:
- Default call returns results in newest-first order
- `filter: "unread"` skips seen messages in batch results
- `filter: "read"` skips unseen messages in batch results
- `order: "oldest"` reverses the result array
- Empty folder (`exists === 0`) returns `[]`
- Scan stops after `limit` matches (does not scan entire folder unnecessarily)
