# Security Policy

## Supported Versions

| Version        | Supported |
| -------------- | --------- |
| `main` branch  | Yes       |
| Older releases | No        |

OpenEllie is currently in active development. Security fixes are applied to the `main` branch only.

---

## Reporting a Vulnerability

**Please do not report security vulnerabilities via GitHub Issues.**

To report a security vulnerability, email: **security@openellie.dev** (or open a [GitHub Security Advisory](https://github.com/your-org/openellie/security/advisories/new) if email is unavailable).

Include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will acknowledge receipt within 48 hours and aim to release a fix within 14 days for critical issues.

---

## Security Model

### Credential Encryption

All connector credentials and API keys are encrypted at rest using **AES-256-GCM**:

- Master key: `ENCRYPTION_MASTER_KEY` in `.env` (64-char hex = 32 bytes)
- Per-workspace key derived via `HMAC-SHA256(masterKey, workspaceId)`
- Stored format: `base64(iv):base64(authTag):base64(ciphertext)`

**Threat model**: If the database is compromised but the master key is not, credentials remain protected.

### Authentication

- **Slack requests**: Verified via `SLACK_SIGNING_SECRET` (HMAC-SHA256 timestamp + body)
- **Internal API**: Protected by `BOT_API_SECRET` header (`X-Internal-Secret`)
- **GitHub**: PAT stored encrypted — scopes should be limited to `repo`, `read:user`, `read:org`

### Rate Limiting

- Per-workspace: 100 queries/hour
- Per-user: 20 queries/hour
- GitHub API: Respects `X-RateLimit-Remaining`, pauses when < 100 remaining

### Data Isolation

- Single-workspace model — all data scoped to one workspace
- `workspace_id` foreign key on all data tables

---

## Security Best Practices for Operators

1. **Generate a strong master key**: `openssl rand -hex 32`
2. **Rotate the master key periodically** — requires re-encrypting all credentials
3. **Use environment secrets** — never commit `.env` to version control
4. **Limit GitHub PAT scopes** — only `repo`, `read:user`, `read:org` needed
5. **Network isolation** — Postgres and Redis should not be publicly accessible
6. **Keep dependencies updated** — run `pnpm audit` regularly
