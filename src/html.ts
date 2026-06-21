import { ENDPOINTS, paidEndpoints } from "./endpoints/registry"

export const getHtmlContent = (walletAddress: string, baseUrl: string, paymentSettled: number) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>StatePulse API - pay-per-call live telemetry and utilities for AI agents</title>
  <!-- AI Agent & Protocol Discovery Specifications -->
  <link rel="alternate" type="text/markdown" title="LLM-friendly documentation" href="/llms.txt">
  <link rel="alternate" type="application/json" title="OpenAPI Specifications" href="/openapi.json">
  <link rel="alternate" type="application/json" title="x402 Payment Specifications" href="/.well-known/x402.json">
  <link rel="alternate" type="application/json" title="Agent Card" href="/.well-known/agent.json">
  <link rel="alternate" type="application/json" title="Model Context Protocol Server Metadata" href="/.well-known/mcp.json">
  <link rel="alternate" type="application/json" title="Open Agent Service Format" href="/.well-known/oasf.json">
  
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #071018;
      --panel: rgba(16, 28, 42, 0.76);
      --panel-strong: rgba(13, 21, 32, 0.92);
      --line: rgba(255, 255, 255, 0.1);
      --text: #f6f8fb;
      --muted: #aab4c2;
      --accent: #38bdf8;
      --accent-2: #22c55e;
      --warn: #facc15;
      --code: #08111f;
      --error: #fb7185;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background: linear-gradient(135deg, #071018 0%, #0f172a 48%, #102019 100%);
      color: var(--text);
      font-family: "Outfit", system-ui, -apple-system, sans-serif;
      line-height: 1.5;
    }

    header {
      border-bottom: 1px solid var(--line);
      background: rgba(7, 16, 24, 0.88);
      position: sticky;
      top: 0;
      z-index: 10;
      backdrop-filter: blur(14px);
    }

    .wrap {
      width: min(1180px, calc(100% - 32px));
      margin: 0 auto;
    }

    .topbar {
      min-height: 72px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }

    .brand {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      color: white;
      text-decoration: none;
      font-weight: 800;
      font-size: 1.2rem;
    }

    .brand svg {
      width: 38px;
      height: 38px;
      border-radius: 8px;
    }

    nav {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
    }

    nav a {
      color: var(--muted);
      text-decoration: none;
      font-size: 0.92rem;
      padding: 8px 10px;
      border-radius: 8px;
    }

    nav a:hover {
      background: rgba(255, 255, 255, 0.06);
      color: white;
    }

    main {
      padding: 42px 0 70px;
      display: grid;
      gap: 28px;
    }

    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1.25fr) minmax(300px, 0.75fr);
      gap: 28px;
      align-items: stretch;
    }

    h1 {
      margin: 0 0 16px;
      font-size: clamp(2.2rem, 5vw, 4.6rem);
      line-height: 1;
      letter-spacing: 0;
      max-width: 820px;
    }

    .lead {
      margin: 0 0 24px;
      color: var(--muted);
      max-width: 760px;
      font-size: 1.12rem;
    }

    .actions,
    .console-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }

    .button {
      min-height: 44px;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 0 16px;
      background: rgba(255, 255, 255, 0.04);
      color: var(--text);
      font: inherit;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-decoration: none;
    }

    .button.primary {
      background: var(--accent);
      border-color: var(--accent);
      color: #04111c;
    }

    .button:hover {
      filter: brightness(1.08);
    }

    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 22px;
      box-shadow: 0 18px 44px rgba(0, 0, 0, 0.28);
    }

    .status {
      display: grid;
      gap: 12px;
    }

    .metric {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.07);
      padding-bottom: 10px;
    }

    .metric:last-child {
      border-bottom: 0;
      padding-bottom: 0;
    }

    .metric span {
      color: var(--muted);
    }

    .metric strong {
      text-align: right;
    }

    .mono,
    code,
    pre,
    input {
      font-family: "Space Mono", Consolas, monospace;
    }

    .grid {
      display: grid;
      grid-template-columns: 0.82fr 1.18fr;
      gap: 28px;
      align-items: start;
    }

    .use-cases {
      display: grid;
      gap: 12px;
    }

    .use-case {
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.035);
      border-radius: 8px;
      padding: 14px;
    }

    .use-case h3,
    .console h2,
    .docs h2 {
      margin: 0 0 8px;
      font-size: 1.05rem;
    }

    .use-case p {
      margin: 0;
      color: var(--muted);
      font-size: 0.94rem;
    }

    .console {
      display: grid;
      gap: 14px;
    }

    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .form-group {
      display: grid;
      gap: 6px;
    }

    .form-group.full {
      grid-column: 1 / -1;
    }

    label {
      color: var(--muted);
      font-size: 0.78rem;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    input {
      width: 100%;
      background: var(--code);
      color: white;
      border: 1px solid var(--line);
      border-radius: 8px;
      min-height: 42px;
      padding: 10px 12px;
      font-size: 0.88rem;
    }

    input:focus {
      outline: 2px solid rgba(56, 189, 248, 0.3);
      border-color: var(--accent);
    }

    pre {
      margin: 0;
      padding: 14px;
      min-height: 120px;
      max-height: 380px;
      overflow: auto;
      white-space: pre-wrap;
      background: var(--code);
      border: 1px solid var(--line);
      border-radius: 8px;
      color: #d9f99d;
      font-size: 0.82rem;
    }

    .response-challenge {
      color: var(--error);
    }

    .response-loading {
      color: var(--muted);
    }

    .docs {
      display: grid;
      gap: 12px;
    }

    .notice {
      border-left: 4px solid var(--accent);
      background: rgba(56, 189, 248, 0.07);
      padding: 14px;
      border-radius: 4px 8px 8px 4px;
      color: var(--muted);
    }

    .notice strong {
      color: var(--text);
    }

    footer {
      border-top: 1px solid var(--line);
      color: var(--muted);
      padding: 30px 0;
      background: rgba(7, 16, 24, 0.75);
    }

    footer .wrap {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }

    footer a {
      color: var(--muted);
    }

    @media (max-width: 860px) {
      .hero,
      .grid,
      .form-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <header>
    <div class="wrap topbar">
      <a href="/" class="brand">
        <svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect width="128" height="128" rx="24" fill="#08111f"/>
          <path d="M31 31h66v18H31z" fill="#38bdf8"/>
          <path d="M31 57h42v14H31z" fill="#f8fafc"/>
          <path d="M31 79h58v18H31z" fill="#22c55e"/>
          <path d="M94 57l13 13-13 13" fill="none" stroke="#facc15" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>StatePulse API</span>
      </a>
      <nav>
        <a href="/openapi.json" target="_blank">OpenAPI</a>
        <a href="/.well-known/x402.json" target="_blank">x402</a>
        <a href="/.well-known/agent.json" target="_blank">Agent Card</a>
        <a href="/terms">Terms</a>
        <a href="/privacy">Privacy</a>
      </nav>
    </div>
  </header>

  <main class="wrap">
    <section class="hero">
      <div>
        <h1>Pay-per-call telemetry and utilities for AI agents</h1>
        <p class="lead">One API, many narrow telemetry and utility endpoints: flight vectors, environmental air quality, weather anomalies, DNS propagation, and regional holidays. No account, no API key &mdash; pay per call with x402 on Base USDC.</p>
        <div class="actions">
          <a href="/try" class="button primary">Try an Endpoint</a>
          <a href="/openapi.json" class="button">Explore Schema</a>
          <button class="button" onclick="copyCurl()">Copy cURL</button>
        </div>
      </div>

      <div class="panel status">
        <div class="metric"><span>Endpoints</span><strong>${ENDPOINTS.length} live</strong></div>
        ${paidEndpoints().slice(0, 4).map((endpoint) => `<div class="metric"><span>${endpoint.summary}</span><strong>$${endpoint.priceUsd} USDC</strong></div>`).join("\n        ")}
        <div class="metric"><span>Network</span><strong>Base EIP-155:8453</strong></div>
        <div class="metric"><span>Wallet</span><strong class="mono">${walletAddress.slice(0, 8)}...${walletAddress.slice(-8)}</strong></div>
        <div class="metric"><span>x402 Settlements</span><strong>${paymentSettled} Succeeded</strong></div>
      </div>
    </section>

    <section class="grid">
      <div class="panel use-cases">
        ${ENDPOINTS.map((endpoint) => `<div class="use-case">
          <h3>${endpoint.summary}</h3>
          <p>${endpoint.whenToUse}</p>
          <p><code>POST ${endpoint.path}</code> &mdash; ${endpoint.free ? "free" : `$${endpoint.priceUsd} USDC`}</p>
        </div>`).join("\n        ")}
      </div>

      <div class="panel console">
        <h2>Endpoint Console</h2>
        <div class="form-grid">
          <div class="form-group full">
            <label>Endpoint</label>
            <select id="endpoint-select">${ENDPOINTS.map((endpoint) => `<option value="${endpoint.path}">${endpoint.path} (${endpoint.free ? "free" : `$${endpoint.priceUsd}`})</option>`).join("")}</select>
          </div>
          <div class="form-group full">
            <label>Request body (JSON)</label>
            <textarea id="body-input" rows="6" style="width:100%;font-family:monospace;background:#08111f;color:#f6f8fb;border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:9px"></textarea>
          </div>
        </div>

        <div class="console-actions">
          <button class="button primary" onclick="fetchChallenge()">Send Request</button>
          <button class="button" onclick="updateCurl()">Refresh cURL</button>
        </div>

        <div class="form-group">
          <label>Output</label>
          <pre id="console-output">Pick an endpoint, edit the body if needed, then click "Send Request".</pre>
        </div>
      </div>
    </section>

    <section class="panel docs">
      <h2>Integration</h2>
      <div class="notice">
        <strong>Protocol standard:</strong> Each endpoint is documented in <code>/openapi.json</code> and <code>/llms.txt</code> with its exact price. Paid endpoints return HTTP 402 and a standard x402 payment challenge until a wallet or facilitator retries with <code>X-Payment</code>.
      </div>
      <pre id="curl-code"></pre>
    </section>
  </main>

  <footer>
    <div class="wrap">
      <span>&copy; 2026 StatePulse API. All rights reserved.</span>
      <span>Contact: <a href="mailto:support@statepulse.dev">support@statepulse.dev</a></span>
    </div>
  </footer>

  <script>
    const ENDPOINT_EXAMPLES = ${JSON.stringify(Object.fromEntries(ENDPOINTS.map((e) => [e.path, e.exampleInput()])))};
    const endpointSelect = document.getElementById("endpoint-select");
    const bodyInput = document.getElementById("body-input");
    const consoleOutput = document.getElementById("console-output");
    const curlCode = document.getElementById("curl-code");

    function loadExample() {
      bodyInput.value = JSON.stringify(ENDPOINT_EXAMPLES[endpointSelect.value] || {}, null, 2);
    }
    endpointSelect.addEventListener("change", loadExample);
    loadExample();

    function payload() {
      try { return JSON.parse(bodyInput.value); } catch { return {}; }
    }

    function updateCurl() {
      curlCode.textContent = \`curl -i -X POST "${baseUrl}\${endpointSelect.value}" \\\\\\n  -H "Content-Type: application/json" \\\\\\n  -d '\${JSON.stringify(payload())}'\`;
    }

    async function fetchChallenge() {
      updateCurl();
      consoleOutput.className = "response-loading";
      consoleOutput.textContent = "Negotiating payment challenge with resource server...";

      try {
        const response = await fetch(endpointSelect.value, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload())
        });
        const challengeHeader = response.headers.get("payment-required") || response.headers.get("Payment-Required");

        if (response.status === 402 && challengeHeader) {
          consoleOutput.className = "response-challenge";
          consoleOutput.textContent = "HTTP 402 Payment Required\\n\\n[payment-required header]:\\n" + JSON.stringify(JSON.parse(atob(challengeHeader)), null, 2);
          return;
        }

        consoleOutput.className = "";
        const text = await response.text();
        try {
          consoleOutput.textContent = \`HTTP \${response.status}\\n\\n\` + JSON.stringify(JSON.parse(text), null, 2);
        } catch {
          consoleOutput.textContent = \`HTTP \${response.status}\\n\\n\` + text;
        }
      } catch (err) {
        consoleOutput.className = "response-challenge";
        consoleOutput.textContent = "API Connection Error:\\n" + err.message;
      }
    }

    function copyCurl() {
      updateCurl();
      navigator.clipboard.writeText(curlCode.textContent);
      alert("cURL snippet copied.");
    }

    updateCurl();
  </script>
</body>
</html>
`;
