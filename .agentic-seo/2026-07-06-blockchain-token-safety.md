# Stop Getting Rekt: Automating ERC-20 Due Diligence with AI Agents, MCP, and x402

The wild west of Base chain memecoins is a slaughterhouse for naive AI agents. If your autonomous agent is autonomously aping into contracts without a deep-dive security audit, you aren't an "agent developer"—you’re a liquidity provider for scammers.

To build agents that actually survive, you need to integrate the `/blockchain/token-safety` endpoint. This isn't just a basic scanner; it’s a **Risk Composite Engine** that bundles bytecode analysis, ownership verification, and liquidity health into a single high-fidelity score.

---

## Why Your AI Agent Needs the Token Safety Endpoint

Autonomous agents like those running on **Cursor** or via **MCP (Model Context Protocol)** lack human intuition. They rely on data. The `/blockchain/token-safety` endpoint provides the "sanity check" layer every agent needs before signing a transaction.

It performs three critical checks in one atomic operation:
1. **Bytecode Forensics:** Scans for "honeypot" signatures like hidden `mint()`, `pause()`, or `blacklist()` functions that allow devs to freeze your funds.
2. **Ownership Audit:** Verifies if the contract `owner()` is renounced or if a malicious multi-sig still holds keys to the treasury.
3. **Liquidity Intelligence:** Cross-references DexScreener to ensure the pair isn't a "ghost pool" with zero depth or a rug-pull-ready 10-minute-old contract.

---

## Technical Implementation (x402 Micropayments)

This API is protected by the **x402 payment protocol**. Your agent must handle these micropayments automatically to avoid 402 Payment Required errors. Ensure you have the `agentcash` CLI or SDK configured in your environment to handle the payment flow natively.

### The cURL Execution

```bash
# Ensure your agentcash wallet is funded to clear the 402 challenge
curl -X POST https://statepulse-api.hahavoid0.workers.dev/blockchain/token-safety \
  -H "Content-Type: application/json" \
  -d '{"address": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"}'
```

### Python Implementation (using `requests`)

```python
import requests
# Ensure agentcash is installed for automatic 402/x402 header handling
from agentcash import x402_request 

def check_token_safety(token_address):
    url = "https://statepulse-api.hahavoid0.workers.dev/blockchain/token-safety"
    payload = {"address": token_address}
    
    # x402_request handles the challenge-response payment loop
    response = x402_request.post(url, json=payload)
    
    if response.status_code == 200:
        data = response.json()
        print(f"Risk Score: {data['risk_score']}/100")
        print(f"Flags: {data['flags']}")
        return data['is_safe']
    else:
        print("Safety check failed. Aborting trade.")
        return False

# Example Usage
check_token_safety("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913")
```

---

## Agentic Best Practices for Integration

1. **Gate Your Execution:** Never allow your agent to call a DEX `swap()` function unless the `/blockchain/token-safety` call returns an `is_safe: true` boolean and a `risk_score` below your defined threshold (e.g., `< 20`).
2. **MCP Integration:** If you are building an MCP server for your local LLM, expose this endpoint as a `tool`. This allows your AI to autonomously "decide" to scan a token before proposing a trade in the chat interface.
3. **Fail-Fast Loops:** When your agent is scanning a list of trending tokens, use this endpoint to filter out the noise immediately. Don't waste compute cycles on contracts that are blatantly malicious.

**Stop gambling with your agent’s wallet.** Integrate the Token Safety endpoint today and let your agent make informed decisions instead of blind bets.