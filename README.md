# StatePulse API

Pay-per-call live telemetry, environmental metrics, transit state vectors, and real-time utilities for AI agents. Narrow, machine-readable agent unblockers for coordinates, speed, air quality, weather anomalies, DNS record propagation, and bank holidays that agents need but can't reliably guess. Served from the same Cloudflare Worker origin as the former PageDiff API.

## Commercial Endpoints

| Endpoint | Price | Purpose |
|---|---:|---|
| `POST /product/barcode` | `$0.030` USDC | Resolves a UPC/EAN or ISBN barcode into detailed product metadata. |
| `POST /airspace/track` | `$0.030` USDC | Track live airspace state vectors for a specific ICAO24 hex identifier. |
| `POST /environment/air-quality` | `$0.030` USDC | Retrieves live localized air quality indices (AQI) and pollutant levels. |
| `POST /transit/status` | `$0.030` USDC | Check transit delays, active alerts, and schedule status updates for supported cities and lines. |
| `POST /weather/anomaly` | `$0.030` USDC | Compares current weather conditions with a 10-year historical average to find anomalies. |
| `POST /radio/stream-url` | `$0.010` USDC | Resolves direct Shoutcast/Icecast streaming URLs from an open radio station directory. |
| `POST /network/dns-propagation` | `$0.010` USDC | Checks global MX, TXT, A, and CNAME propagation status using Cloudflare DoH. |
| `POST /brand/assets` | `$0.030` USDC | Extracts brand logos and theme colors for any public business URL. |
| `POST /prediction/odds` | `$0.030` USDC | Retrieves live betting market contract odds from PredictIt. |
| `POST /water/streamflow` | `$0.030` USDC | Queries live US river level and streamflow gauge height metrics using USGS NWIS. |
| `POST /calendar/holidays` | `$0.010` USDC | Retrieves local bank and public holidays across 100+ countries. |

Every endpoint also responds to `GET <path>` (no payment) with its schema, description, and example input/output, and is fully described in `/openapi.json` and `/llms.txt`.

The current registry exposes 11 paid micro-endpoints. See `AGENT_DISCOVERY_PLAYBOOK.local.md` for the private discovery and checklist.

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
npm run typecheck
```

## Deployment

```bash
npm run deploy
```

This deploys to the `statepulse-api` Cloudflare Worker at `https://statepulse-api.hahavoid0.workers.dev`.

## Payment

Paid endpoints use x402 on Base with USDC. Unpaid requests to paid routes return `HTTP 402 Payment Required` with a standard payment challenge.

Example paid call:

```bash
npx agentcash@latest fetch https://statepulse-api.hahavoid0.workers.dev/weather/anomaly -m POST -b '{"lat":40.71,"lng":-74.00}'
```

```bash
npx agentcash@latest fetch https://statepulse-api.hahavoid0.workers.dev/product/barcode -m POST -b '{"barcode":"9780140449136"}'
```

See `buyer/README.md` for local x402 buyer testing.
