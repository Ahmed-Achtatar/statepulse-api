import "dotenv/config";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";

// Base URL is either from the worker deploy domain or falls back to production
const liveUrl = "https://statepulse-api.hahavoid0.workers.dev";
const privateKey = process.env.EVM_PRIVATE_KEY;

if (!privateKey || privateKey.includes("YOUR_BURNER")) {
  throw new Error("Set EVM_PRIVATE_KEY in buyer/.env first.");
}

const account = privateKeyToAccount(
  privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`
);

const CHEAP_ENDPOINTS = [
  {
    path: "/network/dns-propagation",
    body: { domain: "google.com", type: "MX" }
  },
  {
    path: "/calendar/holidays",
    body: { year: 2026, country_code: "US" }
  }
];

async function run() {
  // Pick a random cheap endpoint
  const endpoint = CHEAP_ENDPOINTS[Math.floor(Math.random() * CHEAP_ENDPOINTS.length)];
  const url = `${liveUrl}${endpoint.path}`;

  console.log("----------------------------------------");
  console.log("Starting programmatic volume simulation...");
  console.log("Buyer wallet:", account.address);
  console.log("Targeting:", url);
  console.log("Payload:", JSON.stringify(endpoint.body));

  const client = new x402Client();
  client.register("eip155:*", new ExactEvmScheme(account));

  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  console.log("Executing call with payment...");
  try {
    const response = await fetchWithPayment(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(endpoint.body)
    });

    console.log("Response HTTP Status:", response.status);

    const paymentResponse = response.headers.get("X-Payment-Response") || response.headers.get("x-payment-response");
    if (paymentResponse) {
      const decodedResponse = Buffer.from(paymentResponse, "base64").toString("utf8");
      console.log("Payment response headers:", decodedResponse);
    }

    const text = await response.text();
    try {
      console.log("Data:", JSON.stringify(JSON.parse(text), null, 2));
    } catch {
      console.log("Raw Response Data:", text);
    }
  } catch (error) {
    console.error("Simulation failed:", error);
  }
  console.log("----------------------------------------");
}

run().catch(console.error);
