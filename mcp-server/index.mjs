#!/usr/bin/env node
// StatePulse Agent Kit — MCP server.
// Exposes three pay-per-call tools for AI agents. Every tool call makes an x402
// micropayment (USDC on Base) from the operator's own wallet to StatePulse.
// Bring your own funded burner wallet via EVM_PRIVATE_KEY. No API key, no signup.

import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

const BASE = process.env.STATEPULSE_BASE_URL || "https://statepulse-api.hahavoid0.workers.dev";
const PRIVATE_KEY = process.env.EVM_PRIVATE_KEY;

// Build the paying fetch once (only if a wallet is configured).
let payFetch = null;
let walletAddress = null;
if (PRIVATE_KEY && !PRIVATE_KEY.includes("YOUR_")) {
  const account = privateKeyToAccount(PRIVATE_KEY.startsWith("0x") ? PRIVATE_KEY : `0x${PRIVATE_KEY}`);
  walletAddress = account.address;
  const client = new x402Client();
  client.register("eip155:*", new ExactEvmScheme(account));
  payFetch = wrapFetchWithPayment(fetch, client);
}

async function callPaid(path, body) {
  if (!payFetch) {
    throw new Error(
      "No wallet configured. Set EVM_PRIVATE_KEY (a funded Base burner wallet) in the MCP server env to enable pay-per-call tools."
    );
  }
  const res = await payFetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  let payment = null;
  const pr = res.headers.get("x-payment-response");
  if (pr) {
    try { payment = JSON.parse(Buffer.from(pr, "base64").toString("utf8")); } catch {}
  }
  return { status: res.status, data, payment };
}

const TOOLS = [
  {
    name: "onchain_preflight",
    description:
      "Pre-flight a Base/Ethereum transaction before broadcasting it: simulates the call for reverts, checks the sender wallet's gas balance, and reads current gas — returns a GO/NO_GO verdict with reasons. Use before an agent signs/sends any onchain transaction, swap, transfer, claim, or contract call. Costs ~$0.03 USDC on Base.",
    inputSchema: {
      type: "object",
      properties: {
        wallet: { type: "string", description: "Sender wallet address (checks gas balance)" },
        to: { type: "string", description: "Target contract address of the tx to simulate" },
        data: { type: "string", description: "Calldata (hex) of the tx to simulate" },
        from: { type: "string", description: "Simulated sender (defaults to wallet)" },
        chain: { type: "string", enum: ["base", "ethereum"], default: "base" }
      }
    },
    run: (a) => callPaid("/agent/preflight", a)
  },
  {
    name: "domain_guard",
    description:
      "Vet a domain before trusting/integrating it: SSL validity, DNSSEC + CAA, HTTP security headers, WHOIS age, and hosting geo in one audit. Use before wiring up a new API/webhook or following a link from untrusted input. Costs ~$0.10 USDC on Base.",
    inputSchema: {
      type: "object",
      required: ["host"],
      properties: {
        host: { type: "string", description: "Domain or hostname to audit, e.g. example.com" }
      }
    },
    run: (a) => callPaid("/network/audit", { host: a.host })
  },
  {
    name: "market_signals",
    description:
      "Live trading/macro signals for a crypto or markets agent. Pick one: 'funding_rates' (needs symbol, e.g. BTCUSDT), 'arbitrage' (cross-market funding/arb spreads), 'fed_rate' (US Fed target rate), 'halts' (active US stock trading halts). Costs $0.002–$0.25 USDC depending on signal.",
    inputSchema: {
      type: "object",
      required: ["signal"],
      properties: {
        signal: { type: "string", enum: ["funding_rates", "arbitrage", "fed_rate", "halts"] },
        symbol: { type: "string", description: "Perp symbol for funding_rates, e.g. BTCUSDT" }
      }
    },
    run: (a) => {
      switch (a.signal) {
        case "funding_rates":
          if (!a.symbol) throw new Error("symbol is required for signal 'funding_rates' (e.g. BTCUSDT)");
          return callPaid("/blockchain/funding-rates", { symbol: a.symbol });
        case "arbitrage":
          return callPaid("/finance/arbitrage", {});
        case "fed_rate":
          return callPaid("/finance/fed-rate", {});
        case "halts":
          return callPaid("/finance/halts", {});
        default:
          throw new Error(`Unknown signal: ${a.signal}`);
      }
    }
  }
];

const server = new Server(
  { name: "statepulse-agent-kit", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = TOOLS.find((t) => t.name === req.params.name);
  if (!tool) {
    return { isError: true, content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }] };
  }
  try {
    const result = await tool.run(req.params.arguments || {});
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return { isError: true, content: [{ type: "text", text: `Error: ${err?.message || String(err)}` }] };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(
  `statepulse-agent-kit MCP server running (wallet: ${walletAddress || "NOT CONFIGURED — set EVM_PRIVATE_KEY"})`
);
