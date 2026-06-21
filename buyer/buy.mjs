import "dotenv/config";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";

const apiUrl = process.env.API_URL || "https://statepulse-api.hahavoid0.workers.dev/weather/anomaly";
const bodyInput = process.env.BODY_INPUT ? JSON.parse(process.env.BODY_INPUT) : { lat: 40.71, lng: -74.00 };
const privateKey = process.env.EVM_PRIVATE_KEY;

if (!privateKey || privateKey.includes("YOUR_BURNER")) {
  throw new Error("Set EVM_PRIVATE_KEY in buyer/.env first. Use a burner MetaMask account.");
}

const account = privateKeyToAccount(
  privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`
);

console.log("Buyer wallet:", account.address);
console.log("Endpoint:", apiUrl);
console.log("Body payload:", JSON.stringify(bodyInput));

const client = new x402Client();
client.register("eip155:*", new ExactEvmScheme(account));

const fetchWithPayment = wrapFetchWithPayment(fetch, client);

const response = await fetchWithPayment(apiUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(bodyInput)
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
