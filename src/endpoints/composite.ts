import { EndpointDef } from "./types"
import { str, response } from "./utils"
import { gasHistoryEndpoint, balanceEndpoint, simulateEndpoint } from "./blockchain"

function createEndpoint(input: Omit<EndpointDef, "free"> & { free?: boolean }): EndpointDef {
  return {
    ...input,
    free: input.free ?? false
  }
}

// COMPOSITE: ONCHAIN TRANSACTION PREFLIGHT
// One paid call that bundles the checks an onchain agent runs before EVERY
// transaction (simulate-for-revert + sender balance + current gas) into a
// single GO / NO_GO verdict. This is the high-frequency loop-step that has no
// single-endpoint competitor in the Bazaar — priced as a bundle, not a commodity.
export const preflightEndpoint = createEndpoint({
  path: "/agent/preflight",
  operationId: "agentPreflight",
  summary: "Onchain Transaction Preflight — Bundled GO/NO-GO Check",
  description: "One call that pre-flights an onchain transaction for an agent: simulates the call for reverts, checks the sender wallet's native gas balance, and reads current Base gas — returning a single GO/NO_GO verdict with reasons. Replaces 3 separate calls (simulate + balances + gas-history) every agent runs before transacting. Matches: pre-transaction check, agent transaction guard, revert + balance + gas preflight, onchain go/no-go, safe-to-send checker, autonomous trade preflight.",
  priceUsd: "0.030",
  requestSchema: {
    type: "object",
    properties: {
      wallet: { type: "string", description: "Sender wallet — checks native gas balance and USDC", examples: ["0x4a82F147c8A4339409C9097Adc1EedFd56E85bFE"] },
      to: { type: "string", description: "Target contract address of the transaction to simulate" },
      data: { type: "string", description: "Calldata payload (hex) of the transaction to simulate", examples: ["0x70a082310000000000000000000000000000000000000000000000000000000000000000"] },
      from: { type: "string", description: "Simulated sender (defaults to wallet)" },
      chain: { type: "string", description: "base or ethereum", default: "base" }
    }
  },
  responseSchema: {
    type: "object"
  },
  tags: ["blockchain", "agent", "preflight", "transaction-guard", "revert-guard", "go-no-go", "bundle", "auto-trader"],
  category: "blockchain",
  whenToUse: "Use as the single pre-send check before an autonomous agent or auto-trader broadcasts an onchain transaction: confirms it won't revert, the sender can pay gas, and gas is reasonable — in one call.",
  doNotUseFor: "Do not use for submitting signed transactions, or as a substitute for full security auditing of an unknown contract.",
  exampleInput: () => ({
    wallet: "0x4a82F147c8A4339409C9097Adc1EedFd56E85bFE",
    to: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    data: "0x70a082310000000000000000000000000000000000000000000000000000000000000000",
    chain: "base"
  }),
  exampleOutput: () => ({
    supported: true,
    result: {
      decision: "GO",
      go: true,
      reasons: [
        "Simulation passed: transaction does not revert.",
        "Wallet native balance: 0.4200 (can pay gas).",
        "Current avg gas: 0.15 gwei."
      ],
      simulation: { reverted: false },
      balance: { native_balance: "0.4200", usdc_balance: "12.50" },
      gas: { avg_base_fee_gwei: 0.15 }
    },
    confidence: "high"
  }),
  logic: async (args, c) => {
    const wallet = str(args, "wallet", false)
    const chain = (str(args, "chain", false) || "base").toLowerCase()
    const to = str(args, "to", false)
    const data = str(args, "data", false)
    const from = str(args, "from", false) || wallet || undefined

    const [gasRes, balRes, simRes] = await Promise.all([
      Promise.resolve(gasHistoryEndpoint.logic({ blocks: 20 }, c)).catch(() => null),
      wallet ? Promise.resolve(balanceEndpoint.logic({ wallet, chain }, c)).catch(() => null) : Promise.resolve(null),
      (to && data) ? Promise.resolve(simulateEndpoint.logic({ to, data, from }, c)).catch(() => null) : Promise.resolve(null)
    ])

    const reasons: string[] = []
    const warnings: string[] = []
    let go = true

    // Distinguish a genuine revert / genuine empty wallet (→ NO_GO) from an
    // RPC/node failure (→ inconclusive warning). A node hiccup must never be
    // reported as a revert or a zero balance — that would be a false NO_GO.
    const simWrap = simRes as any
    const sim = simWrap?.result
    if (sim) {
      const reason = String(sim.reason || "")
      const infraError = /rpc|failed|timeout|timed out|fetch|network/i.test(reason)
      if (sim.reverted && infraError) {
        warnings.push(`Simulation inconclusive — node error (${reason}); revert state unknown, not treated as a failure.`)
      } else if (sim.reverted) {
        go = false
        reasons.push(`Transaction would REVERT: ${reason || "execution reverted"}`)
      } else {
        reasons.push("Simulation passed: transaction does not revert.")
      }
    } else if (to && data) {
      warnings.push("Simulation unavailable — could not confirm revert state.")
    }

    const balWrap = balRes as any
    const bal = balWrap?.result
    if (bal) {
      if (balWrap.confidence === "low") {
        warnings.push("Wallet balance unavailable — node lookup failed; gas-balance not verified.")
      } else {
        const native = Number(bal.native_balance || 0)
        if (native <= 0) {
          go = false
          reasons.push("Wallet has zero native balance — cannot pay gas.")
        } else {
          reasons.push(`Wallet native balance: ${bal.native_balance} (can pay gas).`)
        }
      }
    }

    const gasWrap = gasRes as any
    const gas = gasWrap?.result
    if (gas && gasWrap.confidence !== "low" && gas.avg_base_fee_gwei !== undefined) {
      reasons.push(`Current avg gas: ${gas.avg_base_fee_gwei} gwei.`)
    }

    return response({
      decision: go ? "GO" : "NO_GO",
      go,
      reasons,
      simulation: sim || null,
      balance: bal || null,
      gas: gas || null
    }, "high", warnings)
  },
  skillId: "agent_preflight",
  skillName: "Onchain transaction preflight",
  skillExamples: [
    "Preflight a Base USDC transfer before sending",
    "{\"wallet\":\"0x4a82F147c8A4339409C9097Adc1EedFd56E85bFE\",\"to\":\"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913\",\"data\":\"0x70a08231...\"}"
  ]
})

export const compositeEndpoints = [preflightEndpoint]
