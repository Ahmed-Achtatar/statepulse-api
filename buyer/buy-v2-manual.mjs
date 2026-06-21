import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";

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

function b64(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

const env = loadEnv();
const apiUrl = process.env.API_URL || env.API_URL || "https://statepulse-api.hahavoid0.workers.dev/weather/anomaly";
const bodyInput = process.env.BODY_INPUT ? JSON.parse(process.env.BODY_INPUT) : (env.BODY_INPUT ? JSON.parse(env.BODY_INPUT) : { lat: 40.71, lng: -74.00 });
const privateKey = process.env.EVM_PRIVATE_KEY || env.EVM_PRIVATE_KEY;

if (!privateKey || privateKey.includes("YOUR_PRIVATE")) {
  throw new Error("Set EVM_PRIVATE_KEY in buyer/.env first.");
}

const account = privateKeyToAccount(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`);

console.log("Buyer wallet:", account.address);
console.log("Requesting challenge...");

const firstResponse = await fetch(apiUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(bodyInput)
});

const challenge = await firstResponse.json();
if (firstResponse.status === 402 && !challenge.accepts?.length) {
  const challengeHeader = firstResponse.headers.get("payment-required") || firstResponse.headers.get("Payment-Required");
  if (challengeHeader) {
    Object.assign(challenge, JSON.parse(Buffer.from(challengeHeader, "base64").toString("utf8")));
  }
}

if (firstResponse.status !== 402 || !challenge.accepts?.length) {
  console.log("Unexpected first response:", firstResponse.status);
  console.log(JSON.stringify(challenge, null, 2));
  process.exit(1);
}

const requirement = challenge.accepts[0];
const amountRequired = requirement.amount || requirement.maxAmountRequired;
const now = Math.floor(Date.now() / 1000);
const authorization = {
  from: account.address,
  to: requirement.payTo,
  value: amountRequired,
  validAfter: String(now - 600),
  validBefore: String(now + requirement.maxTimeoutSeconds),
  nonce: `0x${randomBytes(32).toString("hex")}`
};

console.log("Price atomic:", amountRequired);
console.log("Pay to:", requirement.payTo);

const signature = await account.signTypedData({
  domain: {
    name: requirement.extra?.name || "USD Coin",
    version: requirement.extra?.version || "2",
    chainId: 8453,
    verifyingContract: requirement.asset
  },
  types: {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" }
    ]
  },
  primaryType: "TransferWithAuthorization",
  message: authorization
});

const paymentPayload = {
  x402Version: 2,
  resource: challenge.resource,
  scheme: requirement.scheme,
  network: requirement.network,
  payload: {
    signature,
    authorization
  },
  accepted: requirement,
  extensions: challenge.extensions
};

console.log("Submitting paid request...");
const paidResponse = await fetch(apiUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-PAYMENT": b64(paymentPayload),
    "PAYMENT-SIGNATURE": b64(paymentPayload)
  },
  body: JSON.stringify(bodyInput)
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
