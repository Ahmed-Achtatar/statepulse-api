# Stop Building Deaf AI Agents: Real-Time Audio Extraction via MCP & x402

Most AI agents are blind to the live, unfiltered stream of global consciousness. While your agent is stuck reading stale logs and documentation, the rest of the world is broadcasting live on radio. If you’re building autonomous agents with **Cursor, Perplexity, or Devin**, you need to bridge the gap between static data and real-time audio streams.

Enter the `/radio/stream-url` endpoint. It’s the missing link for AI agents that need to monitor geopolitical shifts, breaking news, or cultural sentiment in real-time.

---

## Why Your AI Agent Needs Live Radio Data
Autonomous agents are evolving from text-processors to multimodal listeners. By integrating the **StatePulse API**, your agent can resolve direct Shoutcast/Icecast streaming URLs from an open-source database.

*   **Real-time Sentiment Analysis:** Feed audio streams into a transcription model (like Whisper) to analyze local public opinion.
*   **Geopolitical Monitoring:** Use tags to isolate "news" radio in specific regions for instant intelligence.
*   **Edge Intelligence:** Stop scraping HTML. Go straight to the source audio.

---

## The x402 Micropayment Protocol
This API is powered by the **x402 payment protocol**. This isn’t a bloated SaaS subscription; it’s pay-as-you-go, machine-to-machine commerce. 

To use this endpoint, your agent must handle payment headers automatically. Install the `agentcash` CLI or SDK to handle these transactions:

```bash
npm install -g @agentcash/cli
# Or in your project
npm install @agentcash/sdk
```

Your agent uses `agentcash` to sign transactions for every request, ensuring zero-latency access without manual billing.

---

## Integration: How to Consume the API

### 1. The cURL Request
If you are testing the stream resolution via your terminal or an MCP tool definition:

```bash
curl -X POST https://statepulse-api.hahavoid0.workers.dev/radio/stream-url \
     -H "Content-Type: application/json" \
     -d '{"country": "Morocco", "genre": "news"}'
```

### 2. The Python Implementation
For a production-ready agent (using `requests` and `agentcash` for the x402 challenge/response):

```python
import requests
from agentcash import AgentWallet # Hypothetical SDK usage

wallet = AgentWallet()
url = "https://statepulse-api.hahavoid0.workers.dev/radio/stream-url"
payload = {"country": "Morocco", "genre": "news"}

# The SDK automatically handles the 402 Payment Required handshake
response = wallet.post(url, json=payload)

if response.status_code == 200:
    stream_url = response.json().get("stream_url")
    print(f"Agent connected to: {stream_url}")
else:
    print(f"Error {response.status_code}: {response.text}")
```

---

## Deployment Checklist for AI Developers
1. **Define the Tool:** Add this endpoint to your agent’s **MCP (Model Context Protocol)** configuration.
2. **Authorize the Wallet:** Ensure your `agentcash` wallet has sufficient balance for your token budget.
3. **Stream Processing:** Pipe the returned `stream_url` directly into an FFmpeg stream processor to convert the audio into text embeddings.

**Stop building agents that only read. Start building agents that listen.** 

*Check out the [StatePulse API Documentation](https://statepulse-api.hahavoid0.workers.dev/) to integrate your first audio stream today.*