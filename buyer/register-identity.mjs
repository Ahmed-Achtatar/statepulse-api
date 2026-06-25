import "dotenv/config";
import { createWalletClient, createPublicClient, http } from "viem";
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

// Resolve agenterc-metadata.json
let metadataPath = path.resolve("agenterc-metadata.json");
if (!fs.existsSync(metadataPath)) {
  metadataPath = path.resolve("../agenterc-metadata.json");
}

if (!fs.existsSync(metadataPath)) {
  console.error("Error: Could not locate agenterc-metadata.json in workspace root.");
  process.exit(1);
}

console.log(`Reading metadata from ${metadataPath}...`);
const metadata = fs.readFileSync(metadataPath, "utf8");

// Base64 encode metadata to construct a data URI
const base64Data = Buffer.from(metadata).toString("base64");
const agentURI = `data:application/json;base64,${base64Data}`;

const registryAddress = "0x8004A169FB3a3325136EB29fA0ceB6D2e539a432";
const abi = [
  {
    inputs: [{ name: "agentURI", type: "string" }],
    name: "register",
    outputs: [{ name: "agentId", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function"
  }
];

// Configure RPC URL. Fall back to Base mainnet official RPC
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
  console.log("EIP-8004 Identity Registration Script");
  console.log("--------------------------------------------------");
  console.log("Registry Contract:", registryAddress);
  console.log("Submitter Address:", account.address);
  console.log("Metadata URI length:", agentURI.length, "bytes");

  // If dry-run parameter is passed
  if (process.argv.includes("--dry-run")) {
    console.log("Dry-run validation complete. Data URI structure is valid.");
    console.log("Preview URI snippet:", agentURI.substring(0, 100) + "...");
    return;
  }

  console.log("Sending registration transaction to Base...");
  const hash = await walletClient.writeContract({
    address: registryAddress,
    abi,
    functionName: "register",
    args: [agentURI]
  });

  console.log("Transaction submitted! Hash:", hash);
  console.log("Waiting for confirmation...");
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log("Transaction confirmed in block:", receipt.blockNumber);
  console.log("EIP-8004 Identity registered successfully!");
  console.log("--------------------------------------------------");
}

main().catch((err) => {
  console.error("Registration failed:", err.message || err);
  process.exit(1);
});
