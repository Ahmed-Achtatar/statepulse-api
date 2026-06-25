import "dotenv/config";
import { createWalletClient, createPublicClient, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import fs from "fs";
import path from "path";

const privateKey = process.env.EVM_PRIVATE_KEY;
if (!privateKey || privateKey.includes("YOUR_BURNER")) {
  console.error("Error: Set EVM_PRIVATE_KEY in buyer/.env first.");
  process.exit(1);
}

const account = privateKeyToAccount(
  privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`
);

const liveUrl = process.env.API_HOST || "https://statepulse-api.hahavoid0.workers.dev";
const analyticsToken = process.env.ANALYTICS_TOKEN || "";
const usdcContract = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

const erc20Abi = [
  {
    inputs: [
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    name: "transfer",
    outputs: [{ name: "", type: "boolean" }],
    stateMutability: "nonpayable",
    type: "function"
  }
];

const rpcUrl = process.env.BASE_RPC || "https://mainnet.base.org";
const walletClient = createWalletClient({
  account,
  chain: base,
  transport: http(rpcUrl)
});

const publicClient = createPublicClient({
  chain: base,
  transport: http(rpcUrl)
});

async function main() {
  console.log("--------------------------------------------------");
  console.log("StatePulse Partner Referral Payout Script");
  console.log("--------------------------------------------------");
  console.log("Burner Wallet:", account.address);
  console.log("Base RPC:", rpcUrl);

  const queryUrl = `${liveUrl}/analytics/referrals?token=${analyticsToken}`;
  console.log("Fetching current pending referrals list...");
  const res = await fetch(queryUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch referrals ledger: HTTP ${res.status}`);
  }

  const { referrers } = await res.json();
  const addresses = Object.keys(referrers || {});

  if (addresses.length === 0) {
    console.log("No pending referral credits to distribute.");
    return;
  }

  console.log(`Found ${addresses.length} partners with pending credits:`);
  for (const [addr, amount] of Object.entries(referrers)) {
    console.log(` - ${addr}: ${amount} USDC`);
  }

  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) {
    console.log("\nDry-run complete. No on-chain transactions sent.");
    return;
  }

  console.log("\nStarting on-chain batch distributions...");
  const completedAddresses = [];

  for (const [address, amount] of Object.entries(referrers)) {
    try {
      const parsedAmount = parseUnits(String(amount), 6);
      console.log(`Transferring ${amount} USDC to ${address}...`);

      const hash = await walletClient.writeContract({
        address: usdcContract,
        abi: erc20Abi,
        functionName: "transfer",
        args: [address, parsedAmount]
      });

      console.log(`Transaction submitted! Hash: ${hash}`);
      console.log("Waiting for confirmation...");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`Confirmed in block: ${receipt.blockNumber}`);
      completedAddresses.push(address);
    } catch (txErr) {
      console.error(`Failed to pay ${address}:`, txErr.message || txErr);
    }
  }

  if (completedAddresses.length > 0) {
    console.log("\nClearing paid referrer balances in Cloudflare KV...");
    const clearRes = await fetch(`${liveUrl}/analytics/referrals/clear?token=${analyticsToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referrers: completedAddresses })
    });

    if (clearRes.ok) {
      console.log("KV ledger cleared successfully!");
    } else {
      console.error("Failed to clear KV ledger:", await clearRes.text());
    }
  }

  console.log("--------------------------------------------------");
}

main().catch((err) => {
  console.error("Payout execution error:", err.message || err);
  process.exit(1);
});
