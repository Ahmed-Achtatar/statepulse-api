# PageDiff API 🤖⚡

Pay-per-call archived web page content diffing for monitoring agents. Provide a URL and two dates to compare Wayback Machine snapshots and receive structured added, removed, and modified text blocks.

## 🌟 Agent-First Architecture

This API is built specifically for autonomous AI agents, implementing multiple machine-to-machine interaction and payment protocols out-of-the-box.

### Supported Agent Protocols & Specifications

| Protocol | Description | Spec Location / Endpoint |
|----------|-------------|--------------------------|
| **LLMs Text** | LLM-friendly plain text documentation describing the API's capabilities and usage | [`llms.txt`](llms.txt) / `/llms.txt` |
| **OpenAPI 3.1.0** | Machine-readable API schema and endpoints | [`openapi.json`](openapi.json) / `/openapi.json` |
| **x402** | HTTP 402 Pay-Per-Call protocol (Base Network, USDC) | `/.well-known/x402.json` |
| **MCP** | Model Context Protocol server configuration for LLM tools | `/.well-known/mcp.json` / `/mcp` |
| **A2A** | Agent-to-Agent interface specifications | `/.well-known/agent-card.json` / `/a2a` |
| **OASF** | Open Agent Service Format specifications | `/.well-known/oasf.json` / `/oasf` |
| **EIP-8004** | Trustless Agent Reputation and Identity Registry metadata | [`agenterc-metadata.json`](agenterc-metadata.json) / `/.well-known/agent-registration.json` |

---

## 🛠️ Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Cloudflare Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-setup/) (for deployment)

### Local Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the local development server:
   ```bash
   npm run dev
   ```
3. Run smoke and integration tests:
   ```bash
   npm run smoke
   ```

### Deployment

1. Run the interactive deployment wizard to configure your MetaMask wallet address (Base Network) and deploy to Cloudflare Workers:
   ```bash
   npm run setup
   ```
   *This starts a local dashboard at `http://localhost:8088`.*

2. Alternatively, deploy directly using:
   ```bash
   npm run deploy
   ```

---

## 🔒 Pay-per-Call Integration (`x402`)

All main processing endpoints require micro-payments. If an agent calls a paid route without paying, the server responds with `HTTP 402 Payment Required` and a challenge header. 

To test payments locally, see the instructions in the [PageDiff API Buyer Guide](buyer/README.md).

## 📄 License

This project is licensed under the ISC License. See `package.json` for details.
