import fs from 'fs';
import path from 'path';
import solc from 'solc';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, baseSepolia } from 'viem/chains';

// 1. Load private key from buyer/.env
let privateKey = '';
try {
  const envContent = fs.readFileSync(path.join('buyer', '.env'), 'utf8');
  const lines = envContent.split('\n');
  for (const line of lines) {
    if (line.startsWith('EVM_PRIVATE_KEY=')) {
      privateKey = line.split('=')[1].trim();
      break;
    }
  }
} catch (e) {
  console.error("Could not read buyer/.env file:", e.message);
  process.exit(1);
}

if (!privateKey) {
  console.error("EVM_PRIVATE_KEY not found in buyer/.env");
  process.exit(1);
}

const key = privateKey.startsWith('0x') ? privateKey : '0x' + privateKey;
const account = privateKeyToAccount(key);
console.log("Deployer Wallet Address:", account.address);

// Choose network: default to Base Sepolia (testnet) for safety, or Base Mainnet if specified via argument
const useMainnet = process.argv.includes('--mainnet');
const chain = useMainnet ? base : baseSepolia;
const rpcUrl = useMainnet ? 'https://mainnet.base.org' : 'https://sepolia.base.org';
const usdcAddress = useMainnet 
  ? '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' // USDC Base
  : '0x036cbd53842c5426634e7929541ec2318f3dcf7e'; // USDC Base Sepolia

console.log(`Target Chain: ${chain.name}`);
console.log(`USDC Token Address: ${usdcAddress}`);

// 2. Compile EscrowRegistry.sol
console.log("Compiling contracts/EscrowRegistry.sol...");
const sourcePath = path.resolve('contracts', 'EscrowRegistry.sol');
const sourceCode = fs.readFileSync(sourcePath, 'utf8');

const input = {
  language: 'Solidity',
  sources: {
    'EscrowRegistry.sol': {
      content: sourceCode
    }
  },
  settings: {
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode.object']
      }
    },
    optimizer: {
      enabled: true,
      runs: 200
    }
  }
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
  let hasError = false;
  for (const error of output.errors) {
    console.error(error.formattedMessage);
    if (error.severity === 'error') hasError = true;
  }
  if (hasError) process.exit(1);
}

const contractFile = output.contracts['EscrowRegistry.sol']['EscrowRegistry'];
const abi = contractFile.abi;
const bytecode = ('0x' + contractFile.evm.bytecode.object);

console.log("Compilation successful!");

// 3. Deploy contract using viem
const publicClient = createPublicClient({
  chain,
  transport: http(rpcUrl)
});

const walletClient = createWalletClient({
  account,
  chain,
  transport: http(rpcUrl)
});

async function deploy() {
  console.log("Sending deployment transaction...");
  try {
    const hash = await walletClient.deployContract({
      abi,
      bytecode,
      args: [usdcAddress]
    });
    console.log("Deployment transaction broadcasted. Tx Hash:", hash);

    console.log("Waiting for transaction receipt...");
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const deployedAddress = receipt.contractAddress;

    console.log("\n===========================================");
    console.log("🎉 SUCCESS: Contract Deployed!");
    console.log("Contract Address:", deployedAddress);
    console.log("Transaction Hash:", receipt.transactionHash);
    console.log("===========================================\n");

    console.log("Next Steps:");
    console.log(`1. Add ESCROW_REGISTRY_ADDRESS = "${deployedAddress}" to your wrangler.toml or Worker environment variables.`);
    console.log("2. Run 'npm run deploy' to deploy the updated Worker codebase.");
  } catch (error) {
    console.error("Deployment failed:", error.message || error);
  }
}

deploy();
