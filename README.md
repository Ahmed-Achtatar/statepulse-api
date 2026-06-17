# PageDiff API

Historical page-change evidence for AI agents. PageDiff checks Wayback snapshot availability, compares archived public pages, and returns either raw diffs or interpreted reports with important changes, impact, risks, confidence, and source timestamps.

## Commercial Endpoints

| Endpoint | Price | Purpose |
|---|---:|---|
| `POST /snapshot-check` | Free | Check whether usable Wayback HTML snapshots exist before paying. |
| `POST /diff` | `$0.050` USDC | Return structured added, removed, and modified text blocks. |
| `POST /report` | `$0.500` USDC | Return a persisted business-readable evidence report for pricing, policy, docs, legal terms, positioning, or general change analysis. |
| `POST /batch-report` | `$2.000` USDC | Generate up to five persisted evidence reports in one paid request. |

## Agent-First Architecture

| Protocol | Spec Location / Endpoint |
|---|---|
| LLMs Text | `llms.txt` / `/llms.txt` |
| OpenAPI 3.1.0 | `openapi.json` / `/openapi.json` |
| x402 | `/.well-known/x402.json` |
| MCP | `/.well-known/mcp.json` / `/mcp` |
| A2A | `/.well-known/agent-card.json` / `/a2a` |
| OASF | `/.well-known/oasf.json` / `/oasf` |
| EIP-8004 | `agenterc-metadata.json` / `/.well-known/agent-registration.json` |

## Local Development

```bash
npm install
npm run dev
npm run smoke
```

## Deployment

```bash
npm run setup
```

Or deploy directly:

```bash
npm run deploy
```

## Payment

Paid endpoints use x402 on Base with USDC. Unpaid requests to paid routes return `HTTP 402 Payment Required` with a standard payment challenge.

Use the free preflight before payment:

```bash
curl -X POST https://pagediff-api.hahavoid0.workers.dev/snapshot-check \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/","from":"2023-01-01","to":"2024-01-01"}'
```

Example paid report:

```bash
npx agentcash@latest fetch https://pagediff-api.hahavoid0.workers.dev/report -m POST -b '{"url":"https://example.com/","from":"2023-01-01","to":"2024-01-01","report_type":"pricing_intelligence"}'
```

Example paid batch:

```bash
npx agentcash@latest fetch https://pagediff-api.hahavoid0.workers.dev/batch-report -m POST -b '{"report_type":"pricing_intelligence","items":[{"url":"https://example.com/","from":"2023-01-01","to":"2024-01-01"},{"url":"https://example.com/pricing","from":"2025-01-01","to":"2026-01-01"}]}'
```

Reports and batches are stored for 90 days and return shareable HTML and JSON URLs.

See `buyer/README.md` for local x402 buyer testing.

## Optional Gemini Reports

`POST /report` works without external AI, but becomes sharper when `GEMINI_API_KEY` is configured. With a key, PageDiff asks Gemini to interpret the raw diff and falls back to the built-in rule report if Gemini fails.

Configure production:

```bash
wrangler secret put GEMINI_API_KEY
wrangler secret put GEMINI_MODEL
```

`GEMINI_MODEL` is optional. The default is `gemini-2.0-flash`.

For local development, add this to `.dev.vars`:

```text
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.0-flash
```
