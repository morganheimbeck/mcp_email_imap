# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install dependencies
npm run build        # compile TypeScript → dist/
npm test             # run all tests (vitest)
npm run test:watch   # vitest in watch mode
npm run lint         # biome check
npm run format       # biome format --write
```

Run a single test file:
```bash
npx vitest run tests/tools/read.test.ts
```

Dev without building:
```bash
npm run dev          # ts-node/esm src/index.ts
```

## Architecture

This is an MCP server that exposes email operations over stdio using `@modelcontextprotocol/sdk`.

**Entry point:** `src/index.ts` — creates `McpServer`, registers all 9 tools, connects via `StdioServerTransport`. Tools are thin wrappers: each calls a handler function and wraps the result in `{ content: [{ type: "text", text: JSON.stringify(...) }] }`.

**Config:** `src/config.ts` — validates env vars with Zod. `EMAIL_*` vars are required; `SMTP_*` vars are optional and fall back to `EMAIL_*` values when omitted.

**IMAP layer:** `src/imap-client.ts` (`ImapClient`) — wraps `imapflow`. Maintains a single persistent connection (lazy-connect on first use). Every operation acquires a mailbox lock and releases it in `finally`. UIDs are strings externally but cast to `Number` when passed to imapflow.

**SMTP layer:** `src/smtp-client.ts` (`SmtpClient`) — wraps `nodemailer`. `send_email` requires `confirmed: true`; throws otherwise.

**Tools:** split across `src/tools/read.ts` (list, search, read), `src/tools/organize.ts` (folders, move, mark), `src/tools/compose.ts` (draft, send). Handlers receive the client instance(s) and a plain input object; they return typed values.

**Types:** `src/types.ts` — `EmailSummary`, `EmailMessage`, `Folder`, `Draft`.

**Logging:** `src/logger.ts` — all mutating operations emit JSON lines to stdout.

**Tests:** `tests/` mirrors `src/tools/` structure. Tests are integration-style and require a real IMAP/SMTP connection via `.env`.

## Key conventions

- ESM (`"type": "module"`), so imports use `.js` extensions even for `.ts` source files.
- Biome for lint + format (2-space indent, 100-char line width, double quotes, trailing commas).
- No delete tool by design — use `move_email` to Trash instead.
