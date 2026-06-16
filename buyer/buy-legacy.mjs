import { readFileSync } from "node:fs";
import { createPaymentHeader, selectPaymentRequirements } from "../node_modules/x402/dist/esm/index.mjs";
import { createSigner } from "../node_modules/x402/dist/esm/types/index.mjs";

function loadEnv() {
  const env = {};
  const raw = readFileSync(new URL("./.env", import.meta.url), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...rest] = trimmed.split("=");
    env[key.trim()] = rest.join("=").trim();
  }
  return env;
}

const env = loadEnv();
const apiUrl = env.API_URL || "https://pagediff-api.hahavoid0.workers.dev/diff";
const targetUrl = env.TARGET_URL || "https://example.com/";
const from = env.FROM_DATE || "2023-01-01";
const to = env.TO_DATE || "2024-01-01";
const privateKey = env.EVM_PRIVATE_KEY;

if (!privateKey || privateKey.includes("YOUR_PRIVATE")) {
  throw new Error("Set EVM_PRIVATE_KEY in buyer/.env first.");
}

const key = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
const signer = await createSigner("base", key);

console.log("Buyer wallet:", signer.account?.address || signer.address || "(created)");
console.log("Requesting challenge...");

const firstResponse = await fetch(apiUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: targetUrl, from, to })
});

const challengeBody = await firstResponse.json();
if (firstResponse.status !== 402 || !challengeBody.accepts?.length) {
  console.log("Unexpected first response:", firstResponse.status);
  console.log(JSON.stringify(challengeBody, null, 2));
  process.exit(1);
}

const requirement = selectPaymentRequirements(challengeBody.accepts, "base", "exact");
console.log("Price atomic:", requirement.maxAmountRequired);
console.log("Pay to:", requirement.payTo);

const legacyRequirement = { ...requirement, network: "base" };
const paymentHeader = await createPaymentHeader(signer, 1, legacyRequirement);

console.log("Submitting paid request...");
const paidResponse = await fetch(apiUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-PAYMENT": paymentHeader
  },
  body: JSON.stringify({ url: targetUrl, from, to })
});

console.log("status:", paidResponse.status);

const paymentResponse = paidResponse.headers.get("X-Payment-Response") || paidResponse.headers.get("x-payment-response");
if (paymentResponse) {
  console.log("payment response:", Buffer.from(paymentResponse, "base64").toString("utf8"));
}

const text = await paidResponse.text();
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2));
} catch {
  console.log(text);
}
