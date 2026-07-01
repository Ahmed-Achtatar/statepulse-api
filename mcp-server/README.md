# StatePulse Agent Kit (MCP server)

Three pay-per-call tools for AI agents, over the [x402](https://x402.org) protocol — **bring your own wallet, no API key, no signup.** Every tool call makes a USDC micropayment on Base from your wallet to the StatePulse API.

| Tool | What it does | ~Cost |
|---|---|---|
| `onchain_preflight` | Simulate a tx for reverts + check gas balance + gas conditions → GO/NO_GO before you broadcast | $0.03 |
| `domain_guard` | Audit a domain (SSL, DNSSEC/CAA, security headers, WHOIS age, geo) before trusting it | $0.10 |
| `market_signals` | Perp funding rates, arbitrage spreads, Fed rate, US stock halts | $0.002–$0.25 |

## Setup

1. Install: `npm install` (or run via `npx statepulse-agent-kit` once published).
2. Fund a **burner** wallet with a little USDC on Base (this pays per call).
3. Configure your MCP client with the wallet key:

```json
{
  "mcpServers": {
    "statepulse": {
      "command": "npx",
      "args": ["-y", "statepulse-agent-kit"],
      "env": {
        "EVM_PRIVATE_KEY": "0xYOUR_BURNER_PRIVATE_KEY"
      }
    }
  }
}
```

Use a dedicated burner key with only a few dollars of USDC — never a primary wallet.

## Environment

| Var | Required | Default |
|---|---|---|
| `EVM_PRIVATE_KEY` | yes (to pay) | — |
| `STATEPULSE_BASE_URL` | no | `https://statepulse-api.hahavoid0.workers.dev` |

## How payment works

The server wraps `fetch` with x402 payment (`@x402/fetch`). On a `402 Payment Required`, it signs and submits a USDC transfer on Base for the exact amount the endpoint asks, then retries. You pay only for calls that succeed. No accounts, no subscriptions.

## Notes

Outputs are informational (each response carries a `confidence` and disclaimer) — surface them to your agent's reasoning/risk layer, don't auto-execute value transfers on them.
