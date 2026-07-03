import { createPublicClient, createWalletClient, fallback, http, parseAbi } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { base } from "viem/chains"
import { EndpointDef, validationError } from "./types"
import { str, num, response } from "./utils"
import { BASE_RPCS } from "./blockchain"

// mainnet.base.org rate-limits Worker IPs, so a single-URL transport
// intermittently 500s every write path here. Route through the shared pool.
function baseTransport(envUrl?: string) {
  const urls = envUrl ? [envUrl, ...BASE_RPCS.filter((u) => u !== envUrl)] : BASE_RPCS
  return fallback(urls.map((u) => http(u)))
}

const ESCROW_ABI = parseAbi([
  "function depositBounty(address sender, uint256 amount, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s, bytes32 bountyId, uint256 duration) external",
  "function releaseBounty(bytes32 bountyId, address worker) external",
  "function refundBounty(bytes32 bountyId) external",
  "function bounties(bytes32 bountyId) external view returns (address sender, address worker, uint256 amount, uint256 commission, uint256 createdAt, uint256 duration, bool active, bool completed, bool refunded)"
])

const DEFAULT_ESCROW_REGISTRY = "0x55014C5B9781682B3Cd1EEdFd56E85bFE4a33251"

function createEndpoint(input: Omit<EndpointDef, "free"> & { free?: boolean }): EndpointDef {
  return {
    ...input,
    free: input.free ?? false
  }
}

export const coordinationBountyEndpoint = createEndpoint({
  path: "/coordination/bounties",
  operationId: "depositCoordinationBounty",
  summary: "Deposit Real Onchain USDC Bounty (Base Mainnet)",
  description: "Deposits a real USDC bounty on Base using EIP-3009 receiveWithAuthorization, locking it in the non-custodial EscrowRegistry contract. Matches: deposit onchain bounty, non-custodial escrow bounty, lock usdc bounty.",
  priceUsd: "0.010",
  requestSchema: {
    type: "object",
    required: ["title", "reward_usdc", "duration_days", "sender", "nonce", "valid_before", "signature", "bounty_id"],
    properties: {
      title: { type: "string", description: "Bounty task title" },
      description: { type: "string", description: "Bounty task details/description", default: "" },
      reward_usdc: { type: "string", description: "Bounty reward in USDC (e.g. 10.00)" },
      duration_days: { type: "number", description: "Number of days the bounty is locked for" },
      sender: { type: "string", description: "EVM address of the buyer/sender" },
      nonce: { type: "string", description: "Unique 32-byte hex nonce (0x...) for the EIP-3009 transfer" },
      valid_before: { type: "number", description: "Unix timestamp after which the signature expires" },
      signature: { type: "string", description: "Hex signature authorizing the USDC receiveWithAuthorization transfer" },
      bounty_id: { type: "string", description: "Unique 32-byte hex ID representing this bounty" }
    }
  },
  responseSchema: {
    type: "object"
  },
  tags: ["coordination", "bounties", "finance", "blockchain"],
  category: "finance",
  whenToUse: "Use when an agent wants to lock real USDC on Base to coordinate and incentivize a task payout.",
  doNotUseFor: "Do not use for testing without real USDC on Base Mainnet.",
  exampleInput: () => ({
    title: "Solve Maze Task",
    description: "Submit exit path coordinates",
    reward_usdc: "10.00",
    duration_days: 7,
    sender: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
    nonce: "0x0000000000000000000000000000000000000000000000000000000000000001",
    valid_before: 1800000000,
    signature: "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    bounty_id: "0x000000000000000000000000000000000000000000000000000000000000000a"
  }),
  exampleOutput: () => ({
    supported: true,
    result: {
      bounty_id: "0x000000000000000000000000000000000000000000000000000000000000000a",
      status: "DEPOSITED",
      tx_hash: "0x...",
      reward_usdc: "10.00",
      sender: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
    },
    confidence: "high"
  }),
  logic: async (args, c) => {
    const title = str(args, "title")
    const reward = str(args, "reward_usdc")
    const duration = num(args, "duration_days") ?? 7
    const sender = str(args, "sender")
    const nonce = str(args, "nonce")
    const validBefore = num(args, "valid_before") || 0
    const signature = str(args, "signature")
    const bountyId = str(args, "bounty_id")

    if (!/^0x[a-fA-F0-9]{40}$/.test(sender)) {
      throw validationError("Field 'sender' must be a valid EVM address")
    }
    if (!/^0x[a-fA-F0-9]{64}$/.test(nonce)) {
      throw validationError("Field 'nonce' must be a valid 32-byte hex string (0x...)")
    }
    if (!/^0x[a-fA-F0-9]{64}$/.test(bountyId)) {
      throw validationError("Field 'bounty_id' must be a valid 32-byte hex string (0x...)")
    }

    const rewardNum = parseFloat(reward)
    if (isNaN(rewardNum) || rewardNum <= 0) {
      throw validationError("Field 'reward_usdc' must be a positive decimal number")
    }

    const amount = BigInt(Math.round(rewardNum * 1_000_000))
    const escrowRegistryAddress = (c.env.ESCROW_REGISTRY_ADDRESS as string) || DEFAULT_ESCROW_REGISTRY
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

        const durationSeconds = BigInt(duration * 24 * 60 * 60)

        const { request } = await publicClient.simulateContract({
          account,
          address: escrowRegistryAddress as `0x${string}`,
          abi: ESCROW_ABI,
          functionName: "depositBounty",
          args: [
            sender as `0x${string}`,
            amount,
            BigInt(validBefore),
            nonce as `0x${string}`,
            v,
            r,
            s,
            bountyId as `0x${string}`,
            durationSeconds
          ]
        })

        const hash = await walletClient.writeContract(request)

        return response({
          bounty_id: bountyId,
          title,
          status: "DEPOSITED",
          tx_hash: hash,
          reward_usdc: rewardNum.toFixed(2),
          sender
        }, "high")
      } catch (error: any) {
        throw new Error(`On-chain deposit failed: ${error.message || error}`)
      }
    } else {
      // Simulation fallback when no credentials are configured
      return response({
        bounty_id: bountyId,
        title,
        status: "SIMULATED_DEPOSITED",
        note: "Contract execution was simulated. No EVM_PRIVATE_KEY was found in Workers bindings.",
        call_details: {
          to: escrowRegistryAddress,
          function: "depositBounty",
          args: [
            sender,
            amount.toString(),
            validBefore.toString(),
            nonce,
            v.toString(),
            r,
            s,
            bountyId,
            (duration * 24 * 60 * 60).toString()
          ]
        }
      }, "medium", ["No private key configured on Worker; returning simulated dry-run."])
    }
  },
  skillId: "deposit_coordination_bounty",
  skillName: "Onchain bounty depositor",
  skillExamples: ["Deposit 10 USDC bounty on Base for Solve Maze Task", "{\"title\":\"Solve Maze\",\"reward_usdc\":\"10.00\",\"duration_days\":7,\"sender\":\"0x742d35Cc6634C0532925a3b844Bc454e4438f44e\",\"nonce\":\"0x0000000000000000000000000000000000000000000000000000000000000001\",\"valid_before\":1800000000,\"signature\":\"0x...\",\"bounty_id\":\"0x...\"}"]
})

export const releaseCoordinationBountyEndpoint = createEndpoint({
  path: "/coordination/bounties/release",
  operationId: "releaseCoordinationBounty",
  summary: "Release Deployed USDC Bounty (Base Mainnet)",
  description: "Triggers the EscrowRegistry contract to release a locked USDC bounty to a worker wallet. Releasing can only be authorized by the StatePulse hot wallet (owner). Matches: release onchain bounty, payout escrow bounty, resolve locked bounty.",
  priceUsd: "0.010",
  requestSchema: {
    type: "object",
    required: ["bounty_id", "worker_wallet"],
    properties: {
      bounty_id: { type: "string", description: "Unique 32-byte hex ID representing the locked bounty" },
      worker_wallet: { type: "string", description: "EVM wallet address of the payout recipient" }
    }
  },
  responseSchema: {
    type: "object"
  },
  tags: ["coordination", "bounties", "finance", "blockchain"],
  category: "finance",
  whenToUse: "Use to payout a locked USDC bounty once the task is verified as completed.",
  doNotUseFor: "Do not use for testing without real USDC locked in the escrow contract.",
  exampleInput: () => ({
    bounty_id: "0x000000000000000000000000000000000000000000000000000000000000000a",
    worker_wallet: "0x976EA74026E726554dB657fa54763abd0C3a0aa9"
  }),
  exampleOutput: () => ({
    supported: true,
    result: {
      bounty_id: "0x000000000000000000000000000000000000000000000000000000000000000a",
      status: "COMPLETED",
      tx_hash: "0x...",
      worker_wallet: "0x976EA74026E726554dB657fa54763abd0C3a0aa9"
    },
    confidence: "high"
  }),
  logic: async (args, c) => {
    const bountyId = str(args, "bounty_id")
    const worker = str(args, "worker_wallet")

    if (!/^0x[a-fA-F0-9]{64}$/.test(bountyId)) {
      throw validationError("Field 'bounty_id' must be a valid 32-byte hex string (0x...)")
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(worker)) {
      throw validationError("Field 'worker_wallet' must be a valid EVM address")
    }

    const escrowRegistryAddress = (c.env.ESCROW_REGISTRY_ADDRESS as string) || DEFAULT_ESCROW_REGISTRY
    const transport = baseTransport(c.env.BASE_RPC_URL as string | undefined)
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

        // Simulate as the hot wallet — without an account the simulation runs
        // from the zero address and the onlyOwner check reverts.
        const { request } = await publicClient.simulateContract({
          account,
          address: escrowRegistryAddress as `0x${string}`,
          abi: ESCROW_ABI,
          functionName: "releaseBounty",
          args: [
            bountyId as `0x${string}`,
            worker as `0x${string}`
          ]
        })

        const hash = await walletClient.writeContract(request)

        return response({
          bounty_id: bountyId,
          status: "COMPLETED",
          tx_hash: hash,
          worker_wallet: worker
        }, "high")
      } catch (error: any) {
        throw new Error(`On-chain release failed: ${error.message || error}`)
      }
    } else {
      // Simulation fallback when no credentials are configured
      return response({
        bounty_id: bountyId,
        status: "SIMULATED_COMPLETED",
        note: "Contract execution was simulated. No EVM_PRIVATE_KEY was found in Workers bindings.",
        call_details: {
          to: escrowRegistryAddress,
          function: "releaseBounty",
          args: [bountyId, worker]
        }
      }, "medium", ["No private key configured on Worker; returning simulated dry-run."])
    }
  },
  skillId: "release_coordination_bounty",
  skillName: "Onchain bounty releaser",
  skillExamples: ["Release payout for bounty 0x... to 0x976EA74026E726554dB657fa54763abd0C3a0aa9", "{\"bounty_id\":\"0x...\",\"worker_wallet\":\"0x976EA74026E726554dB657fa54763abd0C3a0aa9\"}"]
})

export const coordinationEndpoints = [
  coordinationBountyEndpoint,
  releaseCoordinationBountyEndpoint
]
