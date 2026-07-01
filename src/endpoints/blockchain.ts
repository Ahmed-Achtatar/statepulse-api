import { EndpointDef } from "./types"
import { str, num, response } from "./utils"

function createEndpoint(input: Omit<EndpointDef, "free"> & { free?: boolean }): EndpointDef {
  return {
    ...input,
    free: input.free ?? false
  }
}

// Public RPC pools with fallback — mainnet.base.org rate-limits Worker IPs,
// which silently degraded every onchain endpoint. Try the primary, then fall
// back through the pool so a single flaky node no longer breaks a response.
const BASE_RPCS = [
  "https://mainnet.base.org",
  "https://base.llamarpc.com",
  "https://base-rpc.publicnode.com",
  "https://base.drpc.org"
]
const ETH_RPCS = [
  "https://cloudflare-eth.com",
  "https://eth.llamarpc.com",
  "https://ethereum-rpc.publicnode.com"
]
const BASE_RPC = BASE_RPCS[0]
const ETH_RPC = ETH_RPCS[0]

async function rpcCall(rpcUrl: string, method: string, params: any[]) {
  const pool = BASE_RPCS.includes(rpcUrl)
    ? BASE_RPCS
    : ETH_RPCS.includes(rpcUrl)
      ? ETH_RPCS
      : [rpcUrl]
  const urls = [rpcUrl, ...pool.filter((u) => u !== rpcUrl)]

  let lastError: any
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
      })
      if (res.ok) {
        const data: any = await res.json()
        if (data.error) {
          lastError = new Error(data.error.message || "RPC error")
          continue
        }
        return data.result
      }
      lastError = new Error(`HTTP ${res.status}`)
    } catch (e) {
      lastError = e
    }
  }
  throw new Error(`RPC call ${method} failed: ${lastError?.message || "all endpoints failed"}`)
}

// 21. CONTRACT ABI RESOLVER
export const abiEndpoint = createEndpoint({
  path: "/blockchain/abi",
  operationId: "getContractAbi",
  summary: "Etherscan/Basescan Verified Contract ABI Resolver",
  description: "Resolves the contract interface JSON (ABI) for verified smart contracts on Base or Ethereum. Matches: get verified smart contract source interface, Basescan verified ABI fetcher, Etherscan contract JSON interface loader, decode transaction calldata helpers, verified contract methods parser.",
  priceUsd: "0.005",
  requestSchema: {
    type: "object",
    required: ["address"],
    properties: {
      address: { type: "string", description: "Smart contract hex address", examples: ["0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"] },
      chain: { type: "string", description: "Target blockchain (ethereum or base)", default: "base" }
    }
  },
  responseSchema: {
    type: "object"
  },
  tags: ["blockchain", "abi", "utilities", "etherscan", "basescan", "verified-contract", "calldata-decoder"],
  category: "blockchain",
  whenToUse: "Use when an on-chain coding or execution agent needs to inspect a contract's verified ABI interface or methods to encode call arguments or decode transaction event logs dynamically.",
  doNotUseFor: "Do not use for unverified contracts or generating private contract code.",
  exampleInput: () => ({ address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", chain: "base" }),
  exampleOutput: () => ({
    supported: true,
    result: {
      address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      chain: "base",
      abi: "[...]"
    },
    confidence: "high"
  }),
  logic: async (args) => {
    const addr = str(args, "address")
    const chain = str(args, "chain", false).toLowerCase() || "base"

    const apiDomain = chain === "ethereum" ? "api.etherscan.io" : "api.basescan.org"

    try {
      const res = await fetch(`https://${apiDomain}/api?module=contract&action=getabi&address=${addr}`)
      if (res.ok) {
        const data: any = await res.json()
        if (data.status === "1") {
          return response({
            address: addr,
            chain,
            abi: JSON.parse(data.result)
          }, "high")
        }
      }
    } catch (e) {}

    return response({ address: addr, chain, note: "Unverified contract or API limit hit." }, "low", ["ABI query returned error status."])
  },
  skillId: "get_contract_abi",
  skillName: "Contract ABI resolver",
  skillExamples: ["Get Base USDC ABI", "{\"address\":\"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913\"}"],
  preflightCheck: async (args) => {
    const addr = String(args.address || "").trim()
    const chain = String(args.chain || "base").toLowerCase()
    const apiDomain = chain === "ethereum" ? "api.etherscan.io" : "api.basescan.org"
    try {
      const res = await fetch(`https://${apiDomain}/api?module=contract&action=getabi&address=${addr}`)
      if (res.ok) {
        const data: any = await res.json()
        const verified = data.status === "1"
        return { available: verified, error: verified ? undefined : `Contract address is not verified on ${chain === "ethereum" ? "Etherscan" : "Basescan"}` }
      }
    } catch (e) {}
    return { available: false, error: "Contract verification check failed" }
  }
})

// 22. EVM TRANSACTION SIMULATOR
export const simulateEndpoint = createEndpoint({
  path: "/blockchain/simulate",
  operationId: "simulateTransaction",
  summary: "EVM Transaction Execution Simulator",
  description: "Runs eth_call state simulation against the Base blockchain RPC to check for transaction reverts. Matches: EVM revert checks, test contract call, inspect transaction failure, dry-run solidity method, gas estimator, test token swap failure, simulate multisig transaction execution.",
  priceUsd: "0.050",
  requestSchema: {
    type: "object",
    required: ["to", "data"],
    properties: {
      to: { type: "string", description: "Target contract address", examples: ["0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"] },
      data: { type: "string", description: "Call data payload in hex", examples: ["0x70a082310000000000000000000000000000000000000000000000000000000000000000"] },
      from: { type: "string", description: "Simulated sender address" },
      value: { type: "string", description: "Call value in hex" }
    }
  },
  responseSchema: {
    type: "object"
  },
  tags: ["blockchain", "simulation", "utilities", "revert-guard", "solidity-dry-run", "uniswap-simulation", "eth-call"],
  category: "blockchain",
  whenToUse: "Use when an on-chain coding agent or auto-trader needs to check if a contract transaction (e.g. Uniswap swap, lending deposit, claim tokens) will succeed, revert, or fail before paying network transaction gas fees.",
  doNotUseFor: "Do not use for actually submitting signed transactions to the pool.",
  exampleInput: () => ({
    to: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    data: "0x70a082310000000000000000000000000000000000000000000000000000000000000000"
  }),
  exampleOutput: () => ({
    supported: true,
    result: {
      reverted: false,
      output_hex: "0x0000000000000000000000000000000000000000000000000000000000000000"
    },
    confidence: "high"
  }),
  logic: async (args) => {
    const to = str(args, "to")
    const data = str(args, "data")
    const from = str(args, "from", false) || undefined
    const value = str(args, "value", false) || undefined

    const txObject = { to, data, from, value }

    try {
      const output = await rpcCall(BASE_RPC, "eth_call", [txObject, "latest"])
      return response({
        reverted: false,
        output_hex: output
      }, "high")
    } catch (e: any) {
      return response({
        reverted: true,
        reason: e.message || "Execution reverted"
      }, "high", ["Simulated RPC call returned revert state."])
    }
  },
  skillId: "simulate_transaction",
  skillName: "EVM transaction simulator",
  skillExamples: ["Simulate Base read call", "{\"to\":\"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913\",\"data\":\"0x70a082310000000000000000000000000000000000000000000000000000000000000000\"}"]
})

// 23. GAS HISTORY & LOW-FEE SCHEDULER
export const gasHistoryEndpoint = createEndpoint({
  path: "/blockchain/gas-history",
  operationId: "getGasHistory",
  summary: "Base Blockchain Gas Fee History & Trend Tracker",
  description: "Scans recent block gas details to estimate the minimum, average, and maximum base fee.",
  priceUsd: "0.001",
  requestSchema: {
    type: "object",
    properties: {
      blocks: { type: "number", description: "Number of preceding blocks to scan", default: 20 }
    }
  },
  responseSchema: {
    type: "object"
  },
  tags: ["blockchain", "gas", "utilities"],
  category: "blockchain",
  whenToUse: "Use when an agent wants to find cheap gas fee windows to execute heavy transactions.",
  doNotUseFor: "Do not use for calculating exact gas limits for individual calls.",
  exampleInput: () => ({ blocks: 20 }),
  exampleOutput: () => ({
    supported: true,
    result: {
      min_base_fee_gwei: 0.1,
      avg_base_fee_gwei: 0.15,
      max_base_fee_gwei: 0.3
    },
    confidence: "high"
  }),
  logic: async (args) => {
    const blocks = num(args, "blocks") || 20
    const count = Math.min(100, Math.max(5, blocks))

    try {
      const history = await rpcCall(BASE_RPC, "eth_feeHistory", ["0x" + count.toString(16), "latest", []])
      const baseFees = (history?.baseFeePerGas || []).map((hex: string) => parseInt(hex, 16) / 1_000_000_000)

      if (baseFees.length > 0) {
        const sum = baseFees.reduce((a: number, b: number) => a + b, 0)
        return response({
          min_base_fee_gwei: Math.min(...baseFees),
          avg_base_fee_gwei: Number((sum / baseFees.length).toFixed(4)),
          max_base_fee_gwei: Math.max(...baseFees)
        }, "high")
      }
    } catch (e) {}

    return response({ min_base_fee_gwei: 0.1 }, "low", ["RPC feeHistory query failed."])
  },
  skillId: "get_gas_history",
  skillName: "Base gas scheduler",
  skillExamples: ["Check gas trend for last 30 blocks", "{\"blocks\":30}"]
})

// 24. WALLET & ERC-20 BALANCE SCANNER
export const balanceEndpoint = createEndpoint({
  path: "/blockchain/balances",
  operationId: "getWalletBalances",
  summary: "Multi-Chain Wallet Token Balance Scanner",
  description: "Scans native balance and ERC-20 token balances for a wallet address on Base or Ethereum.",
  priceUsd: "0.001",
  requestSchema: {
    type: "object",
    required: ["wallet"],
    properties: {
      wallet: { type: "string", description: "EVM wallet address", examples: ["0x4a82F147c8A4339409C9097Adc1EedFd56E85bFE"] },
      chain: { type: "string", description: "ethereum or base", default: "base" }
    }
  },
  responseSchema: {
    type: "object"
  },
  tags: ["blockchain", "balances", "finance"],
  category: "blockchain",
  whenToUse: "Use when an agent needs to monitor the stablecoin or native asset balance of a wallet.",
  doNotUseFor: "Do not use for signing balance transfers or modifying wallet ownership.",
  exampleInput: () => ({ wallet: "0x4a82F147c8A4339409C9097Adc1EedFd56E85bFE" }),
  exampleOutput: () => ({
    supported: true,
    result: {
      wallet: "0x4a82F147c8A4339409C9097Adc1EedFd56E85bFE",
      chain: "base",
      native_balance: "0.42",
      usdc_balance: "12.50"
    },
    confidence: "high"
  }),
  logic: async (args) => {
    const wallet = str(args, "wallet")
    const chain = str(args, "chain", false).toLowerCase() || "base"
    const rpc = chain === "ethereum" ? ETH_RPC : BASE_RPC

    try {
      const nativeBalanceHex = await rpcCall(rpc, "eth_getBalance", [wallet, "latest"])
      const native = (parseInt(nativeBalanceHex, 16) / 10 ** 18).toFixed(4)

      let usdc = "0"
      if (chain === "base") {
        const usdcAddress = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
        // balanceOf method signature: 0x70a08231 + padded wallet address
        const data = "0x70a08231000000000000000000000000" + wallet.substring(2)
        try {
          const balHex = await rpcCall(rpc, "eth_call", [{ to: usdcAddress, data }, "latest"])
          usdc = (parseInt(balHex, 16) / 10 ** 6).toFixed(2) // USDC has 6 decimals
        } catch {}
      }

      return response({
        wallet,
        chain,
        native_balance: native,
        usdc_balance: chain === "base" ? usdc : "N/A"
      }, "high")
    } catch (e) {}

    return response({ wallet, chain, native_balance: "0" }, "low", ["RPC balance lookup failed."])
  },
  skillId: "get_wallet_balances",
  skillName: "Token balance check",
  skillExamples: ["Check balance of wallet 0x4a82F147c8A4339409C9097Adc1EedFd56E85bFE", "{\"wallet\":\"0x4a82F147c8A4339409C9097Adc1EedFd56E85bFE\"}"]
})

// 25. PERPETUALS FUNDING RATES INDICATOR
export const fundingRatesEndpoint = createEndpoint({
  path: "/blockchain/funding-rates",
  operationId: "getFundingRates",
  summary: "Binance Futures Live Perp Funding Rates Ticker",
  description: "Queries current pricing and funding rate margins for perpetual swap contracts from Binance.",
  priceUsd: "0.002",
  requestSchema: {
    type: "object",
    required: ["symbol"],
    properties: {
      symbol: { type: "string", description: "Contract ticker symbol (e.g. BTCUSDT)", examples: ["BTCUSDT"] }
    }
  },
  responseSchema: {
    type: "object"
  },
  tags: ["blockchain", "funding-rates", "trading"],
  category: "blockchain",
  whenToUse: "Use when calculating delta-neutral yield margins or perp arbitrage funding offsets.",
  doNotUseFor: "Do not use for placing leverage orders or managing collateral margins.",
  exampleInput: () => ({ symbol: "BTCUSDT" }),
  exampleOutput: () => ({
    supported: true,
    result: {
      symbol: "BTCUSDT",
      mark_price: "64230.12",
      index_price: "64228.45",
      funding_rate_percentage: 0.0100,
      next_funding_time: "2026-06-25T16:00:00.000Z"
    },
    confidence: "high"
  }),
  logic: async (args) => {
    const symbol = str(args, "symbol").toUpperCase()

    try {
      const res = await fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`)
      if (res.ok) {
        const data: any = await res.json()
        const rate = Number(data.lastFundingRate) || 0
        return response({
          symbol,
          mark_price: data.markPrice,
          index_price: data.indexPrice,
          funding_rate_percentage: Number((rate * 100).toFixed(6)),
          next_funding_time: new Date(data.nextFundingTime).toISOString()
        }, "high")
      }
    } catch (e) {}

    return response({ symbol, note: "Binance futures API timed out." }, "low", ["Perp tickers index query failed."])
  },
  skillId: "get_funding_rates",
  skillName: "Perp funding tracker",
  skillExamples: ["Get funding rate for BTCUSDT", "{\"symbol\":\"BTCUSDT\"}"]
})

export const blockchainEndpoints = [
  abiEndpoint,
  simulateEndpoint,
  gasHistoryEndpoint,
  balanceEndpoint,
  fundingRatesEndpoint
]
