import { createPublicClient, createWalletClient, fallback, http, parseAbi } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { base } from "viem/chains"
import { EndpointDef, validationError } from "./types"
import { str, num, response } from "./utils"
import { BASE_RPCS } from "./blockchain"

// mainnet.base.org rate-limits Worker IPs, so a single-URL transport
// intermittently 500s the relay path. Route through the shared pool.
function baseTransport(envUrl?: string) {
  const urls = envUrl ? [envUrl, ...BASE_RPCS.filter((u) => u !== envUrl)] : BASE_RPCS
  return fallback(urls.map((u) => http(u)))
}

const USDC_ABI = parseAbi([
  "function receiveWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external"
])

const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"

function createEndpoint(input: Omit<EndpointDef, "free"> & { free?: boolean }): EndpointDef {
  return {
    ...input,
    free: input.free ?? false
  }
}

export const blockchainRelayerEndpoint = createEndpoint({
  path: "/blockchain/send",
  operationId: "relayTransaction",
  summary: "Relay Gasless Transaction (Base Mainnet)",
  description: "Relays a transaction to Base Mainnet, paying the native gas on your behalf and charging your wallet equivalent USDC via EIP-3009 receiveWithAuthorization. Matches: gasless tx relayer, submit transaction base, pay gas in usdc.",
  priceUsd: "0.010",
  requestSchema: {
    type: "object",
    required: ["target_contract", "calldata", "max_gas_fee_usdc", "sender", "nonce", "valid_before", "signature"],
    properties: {
      target_contract: { type: "string", description: "The destination contract address to call" },
      calldata: { type: "string", description: "The hex payload calldata of the call" },
      max_gas_fee_usdc: { type: "string", description: "Maximum USDC authorized for gas payment (e.g. 0.50)" },
      sender: { type: "string", description: "EVM address of the sender paying USDC" },
      nonce: { type: "string", description: "32-byte hex nonce for the EIP-3009 transfer" },
      valid_before: { type: "number", description: "Unix timestamp after which signature is invalid" },
      signature: { type: "string", description: "Hex signature authorizing the USDC receiveWithAuthorization transfer" }
    }
  },
  responseSchema: {
    type: "object"
  },
  tags: ["blockchain", "relayer", "gasless", "finance"],
  category: "blockchain",
  whenToUse: "Use when an agent wants to execute a transaction on Base without maintaining an ETH balance for gas.",
  doNotUseFor: "Do not use for read-only contract calls (use /blockchain/simulate instead).",
  exampleInput: () => ({
    target_contract: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    calldata: "0x095ea7b300000000000000000000000055014c5b9781682b3cd1eedfd56e85bfe4a33251ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    max_gas_fee_usdc: "0.50",
    sender: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
    nonce: "0x0000000000000000000000000000000000000000000000000000000000000002",
    valid_before: 1800000000,
    signature: "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
  }),
  exampleOutput: () => ({
    supported: true,
    result: {
      status: "RELAYED",
      gas_fee_collected_usdc: "0.50",
      payment_tx_hash: "0x...",
      execution_tx_hash: "0x..."
    },
    confidence: "high"
  }),
  logic: async (args, c) => {
    const targetContract = str(args, "target_contract")
    const calldata = str(args, "calldata")
    const maxGasUsdc = str(args, "max_gas_fee_usdc")
    const sender = str(args, "sender")
    const nonce = str(args, "nonce")
    const validBefore = num(args, "valid_before") || 0
    const signature = str(args, "signature")

    if (!/^0x[a-fA-F0-9]{40}$/.test(targetContract)) {
      throw validationError("Field 'target_contract' must be a valid EVM address")
    }
    if (!/^0x[a-fA-F0-9]*$/.test(calldata)) {
      throw validationError("Field 'calldata' must be a valid hex string starting with 0x")
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(sender)) {
      throw validationError("Field 'sender' must be a valid EVM address")
    }
    if (!/^0x[a-fA-F0-9]{64}$/.test(nonce)) {
      throw validationError("Field 'nonce' must be a valid 32-byte hex string (0x...)")
    }

    const maxGasNum = parseFloat(maxGasUsdc)
    if (isNaN(maxGasNum) || maxGasNum <= 0) {
      throw validationError("Field 'max_gas_fee_usdc' must be a positive decimal number")
    }

    const gasUsdcAtomic = BigInt(Math.round(maxGasNum * 1_000_000))
    const transport = baseTransport(c.env.BASE_RPC_URL as string | undefined)

    const sig = signature.startsWith("0x") ? signature : "0x" + signature
    if (sig.length !== 132) {
      throw validationError("Field 'signature' must be a valid 65-byte hex signature (130 hex chars starting with 0x)")
    }
    const r = sig.slice(0, 66) as `0x${string}`
    const s = ("0x" + sig.slice(66, 130)) as `0x${string}`
    let v = parseInt(sig.slice(130, 132), 16)
    if (v < 27) v += 27

    const privateKey = c.env.EVM_PRIVATE_KEY as string | undefined

    if (privateKey) {
      try {
        const publicClient = createPublicClient({
          chain: base,
          transport
        })
        const account = privateKeyToAccount(privateKey.startsWith("0x") ? (privateKey as `0x${string}`) : `0x${privateKey}`)
        const walletClient = createWalletClient({
          account,
          chain: base,
          transport
        })

        // Step 1: Collect Gas Fee from User's wallet to our Hot Wallet.
        // Simulate as the hot wallet — receiveWithAuthorization requires
        // msg.sender == payee, so a default (zero-address) sender reverts.
        const { request: requestGas } = await publicClient.simulateContract({
          account,
          address: USDC_BASE,
          abi: USDC_ABI,
          functionName: "receiveWithAuthorization",
          args: [
            sender as `0x${string}`,
            account.address,
            gasUsdcAtomic,
            BigInt(0),
            BigInt(validBefore),
            nonce as `0x${string}`,
            v,
            r,
            s
          ]
        })

        const paymentHash = await walletClient.writeContract(requestGas)

        // Wait for the transaction receipt to make sure gas fee is collected
        await publicClient.waitForTransactionReceipt({ hash: paymentHash })

        // Step 2: Execute Target Transaction
        const txHash = await walletClient.sendTransaction({
          to: targetContract as `0x${string}`,
          data: calldata as `0x${string}`
        })

        return response({
          status: "RELAYED",
          gas_fee_collected_usdc: maxGasNum.toFixed(2),
          payment_tx_hash: paymentHash,
          execution_tx_hash: txHash
        }, "high")
      } catch (error: any) {
        throw new Error(`Transaction relay failed: ${error.message || error}`)
      }
    } else {
      // Simulation fallback when no credentials are configured
      return response({
        status: "SIMULATED_RELAYED",
        note: "Relay execution was simulated. No EVM_PRIVATE_KEY was found in Workers bindings.",
        call_details: {
          gas_collection: {
            to: USDC_BASE,
            function: "receiveWithAuthorization",
            args: [sender, "StatePulseHotWallet", gasUsdcAtomic.toString(), "0", validBefore.toString(), nonce, v.toString(), r, s]
          },
          target_call: {
            to: targetContract,
            data: calldata
          }
        }
      }, "medium", ["No private key configured on Worker; returning simulated dry-run."])
    }
  },
  skillId: "relay_transaction",
  skillName: "Transaction relayer",
  skillExamples: ["Relay call to 0x... with payload 0x... and max gas fee 0.50 USDC", "{\"target_contract\":\"0x...\",\"calldata\":\"0x...\",\"max_gas_fee_usdc\":\"0.50\",\"sender\":\"0x...\",\"nonce\":\"0x...\",\"valid_before\":1800000000,\"signature\":\"0x...\"}"]
})

export const relayEndpoints = [
  blockchainRelayerEndpoint
]
