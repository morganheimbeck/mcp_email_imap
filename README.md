# mcp_email_imap

Universal IMAP/SMTP MCP server. Works with Gmail, Outlook, AWS WorkMail, Fastmail, and any standard IMAP/SMTP provider.

## Quick Start (Docker)

```bash
docker run --rm -i \
  -e EMAIL_HOST=imap.gmail.com \
  -e EMAIL_PORT=993 \
  -e EMAIL_USER=you@gmail.com \
  -e EMAIL_PASS=your-app-password \
  -e SMTP_HOST=smtp.gmail.com \
  -e SMTP_PORT=465 \
  -e SMTP_USER=you@gmail.com \
  -e SMTP_PASS=your-app-password \
  xitstrategies/mcp-email:latest
```

## Tools

| Tool | Description | Mutates |
|------|-------------|---------|
| `list_emails` | Fetch recent/unread mail (sender, subject, date) | No |
| `search_emails` | Search by sender, subject, date range | No |
| `read_email` | Full body + headers by UID | No |
| `get_folders` | List all mailbox folders | No |
| `create_draft` | Compose a draft — never sends | Yes |
| `send_email` | Send email (`confirmed: true` required) | Yes |
| `move_email` | Move message to folder | Yes |
| `mark_read` | Mark messages as read | Yes |
| `mark_unread` | Mark messages as unread | Yes |

## Safety

- `send_email` throws unless `confirmed: true` is explicitly passed.
- No delete tool — use `move_email` to move to Trash.
- All write actions logged as JSON lines to stdout.

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `EMAIL_HOST` | IMAP server | Yes |
| `EMAIL_PORT` | IMAP port (993) | Yes |
| `EMAIL_USER` | IMAP username | Yes |
| `EMAIL_PASS` | IMAP password | Yes |
| `SMTP_HOST` | SMTP server | Yes |
| `SMTP_PORT` | SMTP port (465/587) | Yes |
| `SMTP_USER` | SMTP username | Yes |
| `SMTP_PASS` | SMTP password | Yes |

## Development

```bash
cp .env.example .env  # fill in real credentials
npm install
npm test
npm run build
```

## Docker

Build the image:

```bash
npm run docker:build
# or directly:
docker build -t xitstrategies/mcp-email:latest .
```

## Provider Setup

**Gmail:** Enable IMAP in Gmail settings, generate an App Password (required if 2FA is on). Use `imap.gmail.com:993` and `smtp.gmail.com:465`.

**AWS WorkMail:** Use `imap.mail.<region>.awsapps.com:993` and `smtp.mail.<region>.awsapps.com:465`.

**Microsoft 365:** Use `outlook.office365.com:993` (IMAP) and `smtp.office365.com:587` (SMTP with STARTTLS). After full M365 migration, consider switching to the native M365 MCP connector in the Claude registry instead.
