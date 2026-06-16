import "dotenv/config";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";

const apiUrl = process.env.API_URL || "https://pagediff-api.hahavoid0.workers.dev/diff";
const targetUrl = process.env.TARGET_URL || "https://example.com/";
const from = process.env.FROM_DATE || "2023-01-01";
const to = process.env.TO_DATE || "2024-01-01";
const privateKey = process.env.EVM_PRIVATE_KEY;

if (!privateKey || privateKey.includes("YOUR_BURNER")) {
  throw new Error("Set EVM_PRIVATE_KEY in buyer/.env first. Use a burner MetaMask account.");
}

const account = privateKeyToAccount(
  privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`
);

console.log("Buyer wallet:", account.address);
console.log("Endpoint:", apiUrl);
console.log("Target URL:", targetUrl);
console.log("From:", from);
console.log("To:", to);

const client = new x402Client();
client.register("eip155:*", new ExactEvmScheme(account));

const fetchWithPayment = wrapFetchWithPayment(fetch, client);

const response = await fetchWithPayment(apiUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: targetUrl, from, to })
});

console.log("status:", response.status);

const paymentResponse = response.headers.get("X-Payment-Response") || response.headers.get("x-payment-response");
if (paymentResponse) {
  console.log("payment response:", Buffer.from(paymentResponse, "base64").toString("utf8"));
}

const text = await response.text();
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2));
} catch {
  console.log(text);
}
