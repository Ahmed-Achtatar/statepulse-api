import { ENDPOINTS, paidEndpoints } from "./endpoints/registry"

export const getHtmlContent = (
  walletAddress: string,
  baseUrl: string,
  paymentSettled: number,
  totalRevenue: number = 0.0,
  totalDeposits: number = 0.0
) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>StatePulse API - Live Telemetry & Micro-Utilities for AI Agents</title>
  <link rel="icon" type="image/png" href="/logo.png">
  <link rel="apple-touch-icon" href="/logo.png">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="StatePulse API">
  <meta property="og:title" content="StatePulse API — Live data & utilities for AI agents (x402)">
  <meta property="og:description" content="50 pay-per-call tools for AI agents: live telemetry, environmental, transit, blockchain, network/security and finance utilities. x402 USDC on Base, no API key.">
  <meta property="og:image" content="${baseUrl}/logo.png">
  <meta property="og:url" content="${baseUrl}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="StatePulse API — x402 tools for AI agents">
  <meta name="twitter:description" content="50 pay-per-call tools for AI agents. x402 USDC on Base, no API key.">
  <meta name="twitter:image" content="${baseUrl}/logo.png">
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
      --bg: #060913;
      --panel: rgba(15, 23, 42, 0.65);
      --panel-strong: rgba(10, 15, 30, 0.95);
      --line: rgba(255, 255, 255, 0.08);
      --text: #f8fafc;
      --muted: #94a3b8;
      --accent: #38bdf8;
      --accent-rgb: 56, 189, 248;
      --accent-2: #22c55e;
      --accent-2-rgb: 34, 197, 94;
      --warn: #eab308;
      --code: #090d16;
      --error: #f43f5e;
      --glow: rgba(56, 189, 248, 0.08);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      min-height: 100vh;
      background: radial-gradient(circle at 50% 0%, #0f1c30 0%, #060913 80%);
      color: var(--text);
      font-family: "Outfit", system-ui, -apple-system, sans-serif;
      line-height: 1.5;
      padding-bottom: 80px;
    }

    header {
      border-bottom: 1px solid var(--line);
      background: rgba(6, 9, 19, 0.8);
      position: sticky;
      top: 0;
      z-index: 100;
      backdrop-filter: blur(16px);
    }

    .wrap {
      width: min(1200px, calc(100% - 32px));
      margin: 0 auto;
    }

    .topbar {
      min-height: 80px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
    }

    .brand {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      color: white;
      text-decoration: none;
      font-weight: 800;
      font-size: 1.3rem;
      letter-spacing: -0.02em;
    }

    .brand svg {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      box-shadow: 0 0 20px rgba(56, 189, 248, 0.2);
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
      font-weight: 500;
      padding: 8px 14px;
      border-radius: 8px;
      transition: all 0.2s;
      border: 1px solid transparent;
    }

    nav a:hover {
      background: rgba(255, 255, 255, 0.05);
      color: white;
      border-color: rgba(255, 255, 255, 0.05);
    }

    main {
      padding: 40px 0 0;
      display: grid;
      gap: 32px;
    }

    .hero {
      display: grid;
      grid-template-columns: 1.3fr 0.7fr;
      gap: 32px;
      align-items: center;
    }

    h1 {
      font-size: clamp(2.4rem, 4.5vw, 3.8rem);
      line-height: 1.1;
      font-weight: 800;
      letter-spacing: -0.03em;
      margin-bottom: 16px;
      background: linear-gradient(to right, #ffffff, #94a3b8);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .lead {
      margin-bottom: 28px;
      color: var(--muted);
      font-size: 1.15rem;
      line-height: 1.6;
      font-weight: 400;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }

    .button {
      min-height: 46px;
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 0 20px;
      background: rgba(255, 255, 255, 0.03);
      color: var(--text);
      font-family: inherit;
      font-weight: 600;
      font-size: 0.95rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-decoration: none;
      transition: all 0.2s;
      gap: 8px;
    }

    .button.primary {
      background: var(--accent);
      border-color: var(--accent);
      color: #040914;
      box-shadow: 0 4px 20px rgba(56, 189, 248, 0.25);
    }

    .button:hover {
      transform: translateY(-1px);
      filter: brightness(1.1);
    }

    .button.primary:hover {
      box-shadow: 0 6px 24px rgba(56, 189, 248, 0.35);
    }

    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 24px;
      backdrop-filter: blur(12px);
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
    }

    .status {
      display: grid;
      gap: 12px;
    }

    .status h3 {
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--accent);
      margin-bottom: 4px;
    }

    .metric {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      padding-bottom: 10px;
      font-size: 0.95rem;
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
      color: #ffffff;
    }

    .mono,
    code,
    pre,
    input,
    textarea,
    select {
      font-family: "Space Mono", Consolas, monospace;
    }

    .grid {
      display: grid;
      grid-template-columns: 1.15fr 0.85fr;
      gap: 32px;
      align-items: start;
    }

    .explorer-header {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 20px;
    }

    .explorer-header-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .explorer-title {
      font-size: 1.3rem;
      font-weight: 700;
      letter-spacing: -0.01em;
    }

    .visible-count-badge {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--accent);
      background: rgba(56, 189, 248, 0.08);
      padding: 4px 10px;
      border-radius: 20px;
      border: 1px solid rgba(56, 189, 248, 0.15);
    }

    .search-bar input {
      width: 100%;
      background: var(--code);
      border: 1px solid var(--line);
      border-radius: 10px;
      color: white;
      padding: 12px 16px;
      font-size: 0.9rem;
      transition: all 0.2s;
    }

    .search-bar input:focus {
      border-color: var(--accent);
      outline: none;
      box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.15);
    }

    .tabs-container {
      display: flex;
      gap: 6px;
      margin-bottom: 20px;
      overflow-x: auto;
      padding-bottom: 8px;
      scrollbar-width: none;
    }

    .tabs-container::-webkit-scrollbar {
      display: none;
    }

    .tab-btn {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--line);
      color: var(--muted);
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.2s;
    }

    .tab-btn:hover {
      background: rgba(255, 255, 255, 0.06);
      color: white;
      border-color: rgba(255, 255, 255, 0.1);
    }

    .tab-btn.active {
      background: var(--accent);
      border-color: var(--accent);
      color: #060913;
    }

    .use-cases-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 16px;
      max-height: 800px;
      overflow-y: auto;
      padding-right: 8px;
    }

    /* Scrollbar Styling */
    .use-cases-grid::-webkit-scrollbar {
      width: 6px;
    }
    .use-cases-grid::-webkit-scrollbar-track {
      background: rgba(255, 255, 255, 0.02);
      border-radius: 3px;
    }
    .use-cases-grid::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 3px;
    }
    .use-cases-grid::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    .use-case-card {
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.02);
      border-radius: 12px;
      padding: 18px;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .use-case-card:hover {
      transform: translateY(-2px);
      border-color: rgba(56, 189, 248, 0.4);
      background: rgba(56, 189, 248, 0.03);
      box-shadow: 0 8px 30px rgba(56, 189, 248, 0.04);
    }

    .use-case-card.featured {
      border-color: rgba(34, 197, 94, 0.35);
      background: rgba(34, 197, 94, 0.02);
      box-shadow: 0 0 15px rgba(34, 197, 94, 0.05);
      position: relative;
      overflow: hidden;
    }

    .use-case-card.featured::before {
      content: "RECOMMENDED BUNDLE";
      position: absolute;
      top: 0;
      right: 0;
      background: var(--accent-2);
      color: #060913;
      font-size: 0.65rem;
      font-weight: 800;
      letter-spacing: 0.05em;
      padding: 3px 10px;
      border-bottom-left-radius: 8px;
    }

    .use-case-card.featured:hover {
      border-color: rgba(34, 197, 94, 0.6);
      background: rgba(34, 197, 94, 0.04);
      box-shadow: 0 8px 30px rgba(34, 197, 94, 0.08);
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
    }

    .card-title {
      font-size: 1.05rem;
      font-weight: 700;
      color: white;
      line-height: 1.3;
    }

    .card-badge {
      font-size: 0.8rem;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 6px;
      white-space: nowrap;
    }

    .card-badge.paid {
      background: rgba(34, 197, 94, 0.15);
      color: #4ade80;
      border: 1px solid rgba(34, 197, 94, 0.2);
    }

    .card-badge.free {
      background: rgba(56, 189, 248, 0.15);
      color: var(--accent);
      border: 1px solid rgba(56, 189, 248, 0.2);
    }

    .card-path {
      font-size: 0.8rem;
      color: var(--accent);
      background: var(--code);
      padding: 6px 10px;
      border-radius: 6px;
      display: inline-block;
      align-self: flex-start;
      word-break: break-all;
      border: 1px solid rgba(255, 255, 255, 0.03);
    }

    .card-desc {
      font-size: 0.9rem;
      color: var(--muted);
      line-height: 1.45;
    }

    .card-details {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding-left: 8px;
      border-left: 2px solid rgba(255, 255, 255, 0.05);
    }

    .card-detail-item {
      font-size: 0.82rem;
      color: var(--muted);
    }

    .card-detail-item strong {
      color: #cbd5e1;
    }

    .card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 4px;
      padding-top: 8px;
      border-top: 1px solid rgba(255, 255, 255, 0.04);
    }

    .card-category-tag {
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
    }

    .card-run-btn {
      background: transparent;
      border: none;
      color: var(--accent);
      cursor: pointer;
      font-size: 0.85rem;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      border-radius: 6px;
      transition: background 0.2s;
    }

    .card-run-btn:hover {
      background: rgba(56, 189, 248, 0.1);
    }

    .console {
      display: grid;
      gap: 18px;
      position: sticky;
      top: 112px;
    }

    .console h2 {
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: -0.01em;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    label {
      color: var(--muted);
      font-size: 0.75rem;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    select, textarea {
      width: 100%;
      background: var(--code);
      color: var(--text);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 0.9rem;
      transition: border-color 0.2s;
    }

    select:focus, textarea:focus {
      border-color: var(--accent);
      outline: none;
    }

    .console-actions {
      display: flex;
      gap: 10px;
    }

    pre {
      margin-top: 4px;
      padding: 14px;
      min-height: 120px;
      max-height: 400px;
      overflow: auto;
      white-space: pre-wrap;
      background: var(--code);
      border: 1px solid var(--line);
      border-radius: 8px;
      color: #bef264;
      font-size: 0.82rem;
      line-height: 1.4;
      border-left: 3px solid var(--accent-2);
    }

    .response-challenge {
      color: #fda4af;
      border-left-color: var(--error);
    }

    .response-loading {
      color: #93c5fd;
      border-left-color: var(--accent);
    }

    .integration-docs {
      display: grid;
      gap: 16px;
    }

    .integration-docs h2 {
      font-size: 1.25rem;
      font-weight: 700;
    }

    .notice {
      border-left: 4px solid var(--accent);
      background: rgba(56, 189, 248, 0.05);
      padding: 16px;
      border-radius: 4px 10px 10px 4px;
      color: var(--muted);
      font-size: 0.95rem;
    }

    .notice strong {
      color: white;
    }

    .integration-docs pre {
      color: #f1f5f9;
      border-left-color: var(--accent);
      max-height: none;
    }

    footer {
      border-top: 1px solid var(--line);
      color: var(--muted);
      padding: 32px 0;
      background: rgba(6, 9, 19, 0.9);
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 80px;
    }

    footer .wrap {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 20px;
      font-size: 0.9rem;
    }

    footer a {
      color: var(--accent);
      text-decoration: none;
    }

    footer a:hover {
      text-decoration: underline;
    }

    @media (max-width: 900px) {
      .hero {
        grid-template-columns: 1fr;
      }
      .grid {
        grid-template-columns: 1fr;
      }
      .console {
        position: static;
      }
      body {
        padding-bottom: 120px;
      }
      footer {
        height: 120px;
      }
      footer .wrap {
        flex-direction: column;
        text-align: center;
        gap: 8px;
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
        <a href="/llms.txt" target="_blank">llms.txt</a>
      </nav>
    </div>
  </header>

  <main class="wrap">
    <section class="hero">
      <div>
        <h1>Autonomous Telemetry<br>& Utilities for AI Agents</h1>
        <p class="lead">Machine-readable live telemetry, environmental metrics, route logistics, and execution utilities built specifically for AI agents. No signups or API keys required &mdash; pay-per-call natively using x402 USDC on Base mainnet.</p>
        <div class="actions">
          <a href="#explorer-section" class="button primary">Explore Directory</a>
          <a href="/openapi.json" class="button" target="_blank">OpenAPI Spec</a>
          <button class="button" onclick="copyCurl()">Copy Current cURL</button>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 20px;">
        <div class="panel status">
          <div class="metric">
            <span>Total Endpoints</span>
            <strong>${ENDPOINTS.length} Live</strong>
          </div>
          ${paidEndpoints().slice(0, 4).map((endpoint) => `
          <div class="metric">
            <span>${endpoint.summary}</span>
            <strong>$${endpoint.priceUsd} USDC</strong>
          </div>`).join("")}
          <div class="metric">
            <span>Settlement Chain</span>
            <strong>Base Mainnet (EIP-155:8453)</strong>
          </div>
          <div class="metric">
            <span>Settlement Wallet</span>
            <strong class="mono" style="font-size:0.85rem">${walletAddress.slice(0, 8)}...${walletAddress.slice(-8)}</strong>
          </div>
          <div class="metric">
            <span>x402 Volume</span>
            <strong>${paymentSettled} Settled Calls</strong>
          </div>
          <div class="metric">
            <span>Credit Deposits</span>
            <strong>$${totalDeposits.toFixed(3)} USDC</strong>
          </div>
          <div class="metric">
            <span>Total API Revenue</span>
            <strong>$${totalRevenue.toFixed(3)} USDC</strong>
          </div>
        </div>

        <div class="panel vault" style="border-left: 3px solid var(--accent-2); display: flex; flex-direction: column; gap: 14px;">
          <h3 style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent-2);">Prepaid Key Vault</h3>
          <p style="font-size: 0.88rem; color: var(--muted); line-height: 1.45;">
            Send Base USDC to the Settlement Wallet to purchase API credits, then claim your key below:
          </p>
          
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <label style="font-size: 0.7rem; font-weight: 800; color: var(--muted);">Deposit TxHash</label>
            <input type="text" id="vault-txhash" placeholder="0x..." style="width: 100%; background: var(--code); color: white; border: 1px solid var(--line); border-radius: 8px; padding: 8px 12px; font-size: 0.85rem;">
          </div>
          
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <label style="font-size: 0.7rem; font-weight: 800; color: var(--muted);">Your Wallet Address</label>
            <input type="text" id="vault-wallet" placeholder="0x..." style="width: 100%; background: var(--code); color: white; border: 1px solid var(--line); border-radius: 8px; padding: 8px 12px; font-size: 0.85rem;">
          </div>

          <button class="button" style="background: var(--accent-2); border-color: var(--accent-2); color: #060913; font-weight: 700; box-shadow: 0 4px 14px rgba(34, 197, 94, 0.25); min-height: 38px; width: 100%; font-size: 0.9rem;" onclick="claimApiKey()">Claim API Key</button>
          
          <div id="vault-result" style="display: none; flex-direction: column; gap: 6px; margin-top: 6px;">
            <label style="font-size: 0.7rem; font-weight: 800; color: var(--accent-2);">Your Prepaid Key</label>
            <div style="display: flex; gap: 8px; align-items: center;">
              <input type="text" id="vault-key" readonly style="flex: 1; background: var(--code); color: #bef264; border: 1px solid rgba(190, 242, 100, 0.2); border-radius: 8px; padding: 8px 12px; font-size: 0.85rem;" onclick="this.select()">
              <button class="button" style="min-height: 34px; padding: 0 10px; font-size: 0.8rem;" onclick="copyVaultKey()">Copy</button>
            </div>
            <span id="vault-balance" style="font-size: 0.8rem; color: var(--muted);"></span>
          </div>
        </div>
      </div>
    </section>

    <section class="grid" id="explorer-section">
      <div class="panel explorer">
        <div class="explorer-header">
          <div class="explorer-header-top">
            <h2 class="explorer-title">Endpoints Directory</h2>
            <span class="visible-count-badge" id="visible-count">Showing ${ENDPOINTS.length} of ${ENDPOINTS.length} endpoints</span>
          </div>
          <div class="search-bar">
            <input type="text" id="search-input" placeholder="Search by endpoint name, path, description, keywords...">
          </div>
        </div>

        <div class="tabs-container">
          <button class="tab-btn active" data-tab="all">All Categories</button>
          <button class="tab-btn" data-tab="blockchain">Web3 & Blockchain</button>
          <button class="tab-btn" data-tab="logistics">Logistics & Transit</button>
          <button class="tab-btn" data-tab="environment">Environment & Climate</button>
          <button class="tab-btn" data-tab="financial">Financial & IP</button>
          <button class="tab-btn" data-tab="network">Network & Utilities</button>
        </div>

        <div class="use-cases-grid" id="use-cases-list">
          ${ENDPOINTS.map((endpoint) => `
          <div class="use-case-card${endpoint.path === "/agent/preflight" ? " featured" : ""}" 
               data-path="${endpoint.path}" 
               data-category="${endpoint.category}" 
               data-summary="${endpoint.summary}" 
               data-desc="${endpoint.description}" 
               data-tags="${endpoint.tags.join(" ")}"
               data-skill-id="${endpoint.skillId}">
            <div class="card-header">
              <h3 class="card-title">${endpoint.summary}</h3>
              <span class="card-badge ${endpoint.free ? 'free' : 'paid'}">
                ${endpoint.free ? 'Free' : `$${endpoint.priceUsd} USDC`}
              </span>
            </div>
            <div class="card-path">POST ${endpoint.path}</div>
            <p class="card-desc">${endpoint.description}</p>
            <div class="card-details">
              <div class="card-detail-item"><strong>When to Use:</strong> ${endpoint.whenToUse}</div>
              <div class="card-detail-item"><strong>Do Not Use For:</strong> ${endpoint.doNotUseFor}</div>
            </div>
            <div class="card-footer">
              <span class="card-category-tag">${endpoint.category}</span>
              <button class="card-run-btn" onclick="selectEndpointInConsole('${endpoint.path}')">
                Run in Console &rarr;
              </button>
            </div>
          </div>`).join("")}
        </div>
      </div>

      <div class="panel console" id="console-section">
        <h2>Interactive Console</h2>
        <div class="form-group">
          <label for="endpoint-select">Target Endpoint</label>
          <select id="endpoint-select">
            ${ENDPOINTS.map((endpoint) => `
            <option value="${endpoint.path}">
              ${endpoint.path} (${endpoint.free ? 'Free' : `$${endpoint.priceUsd} USDC`})
            </option>`).join("")}
          </select>
        </div>
        <div class="form-group">
          <label for="body-input">Request Body (JSON)</label>
          <textarea id="body-input" rows="8"></textarea>
        </div>

        <div class="console-actions">
          <button class="button primary" style="flex: 1" onclick="fetchChallenge()">Send Request</button>
          <button class="button" onclick="updateCurl()">Refresh cURL</button>
        </div>

        <div class="form-group">
          <label>Response Console</label>
          <pre id="console-output">Pick an endpoint from the left or select it here, review/edit the request JSON, then click "Send Request".</pre>
        </div>
      </div>
    </section>

    <section class="panel integration-docs">
      <h2>Automatic x402 Protocol Integration</h2>
      <div class="notice">
        <strong>Direct Agent Execution:</strong> To invoke paid endpoints, agents negotiate the x402 protocol challenge. When receiving a <code>402 Payment Required</code> response, parse the <code>payment-required</code> header containing payment specifications, initiate a Base USDC transfer, and resubmit the request with the <code>X-Payment</code> header.
      </div>
      <pre id="curl-code"></pre>
    </section>

    <section class="panel integration-docs">
      <h2>Add StatePulse to your IDE (MCP Config)</h2>
      <p style="color: var(--muted); font-size: 0.95rem; margin-bottom: 16px;">
        StatePulse runs a Model Context Protocol (MCP) server. You can integrate all 50+ tools directly into <strong>Cursor</strong>, <strong>Windsurf</strong>, or <strong>Claude Desktop</strong>.
      </p>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
        <div>
          <h3 style="font-size: 0.9rem; text-transform: uppercase; color: var(--accent); margin-bottom: 8px; letter-spacing: 0.05em;">Claude Desktop Config</h3>
          <p style="font-size: 0.85rem; color: var(--muted); margin-bottom: 8px;">
            Add this server entry to your <code>claude_desktop_config.json</code>:
          </p>
          <pre style="border-left-color: var(--accent); font-size: 0.8rem; min-height: unset; margin: 0;">{
  "mcpServers": {
    "statepulse": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-http",
        "${baseUrl}/mcp"
      ]
    }
  }
}</pre>
        </div>
        <div>
          <h3 style="font-size: 0.9rem; text-transform: uppercase; color: var(--accent); margin-bottom: 8px; letter-spacing: 0.05em;">Cursor / Windsurf Config</h3>
          <p style="font-size: 0.85rem; color: var(--muted); margin-bottom: 8px;">
            Go to <strong>Settings &gt; Models &gt; MCP</strong> (or Windsurf config), click <strong>+ Add New MCP Server</strong>:
          </p>
          <ul style="font-size: 0.85rem; color: var(--muted); margin-left: 20px; margin-bottom: 8px; display: flex; flex-direction: column; gap: 6px;">
            <li><strong>Name:</strong> <code>statepulse</code></li>
            <li><strong>Type:</strong> <code>command</code></li>
            <li><strong>Command:</strong> <code style="color: #bef264;">npx -y @modelcontextprotocol/server-http ${baseUrl}/mcp</code></li>
          </ul>
        </div>
      </div>
    </section>
  </main>

  <footer>
    <div class="wrap">
      <span>&copy; 2026 StatePulse API. Served via Cloudflare Workers. All rights reserved.</span>
      <span>Discovery manifests: <a href="/openapi.json" target="_blank">openapi.json</a> &bull; <a href="/llms.txt" target="_blank">llms.txt</a></span>
    </div>
  </footer>

  <script>
    const ENDPOINT_EXAMPLES = ${JSON.stringify(Object.fromEntries(ENDPOINTS.map((e) => [e.path, e.exampleInput()])))}
    const endpointSelect = document.getElementById("endpoint-select")
    const bodyInput = document.getElementById("body-input")
    const consoleOutput = document.getElementById("console-output")
    const curlCode = document.getElementById("curl-code")

    // Filter UI elements
    const searchInput = document.getElementById("search-input")
    const tabButtons = document.querySelectorAll(".tab-btn")
    const cards = document.querySelectorAll(".use-case-card")
    const countDisplay = document.getElementById("visible-count")

    let activeTab = "all"
    let searchFilter = ""

    const categoryToTab = {
      'blockchain': 'blockchain',
      'transit': 'logistics',
      'logistics': 'logistics',
      'environment': 'environment',
      'agriculture': 'environment',
      'finance': 'financial',
      'market': 'financial',
      'commerce': 'financial',
      'network': 'network',
      'utilities': 'network',
      'media': 'network',
      'design': 'network'
    }

    function filterCards() {
      let count = 0
      cards.forEach(card => {
        const category = card.dataset.category || ""
        const tabGroup = categoryToTab[category] || "network"
        const path = card.dataset.path.toLowerCase()
        const summary = card.dataset.summary.toLowerCase()
        const desc = card.dataset.desc.toLowerCase()
        const tags = card.dataset.tags.toLowerCase()
        
        const matchesTab = activeTab === "all" || tabGroup === activeTab
        const matchesSearch = !searchFilter || 
          path.includes(searchFilter) || 
          summary.includes(searchFilter) || 
          desc.includes(searchFilter) || 
          tags.includes(searchFilter)
          
        if (matchesTab && matchesSearch) {
          card.style.display = "flex"
          count++
        } else {
          card.style.display = "none"
        }
      })
      
      if (countDisplay) {
        countDisplay.textContent = \`Showing \${count} of \${cards.length} endpoints\`
      }
    }

    searchInput.addEventListener("input", (e) => {
      searchFilter = e.target.value.toLowerCase().trim()
      filterCards()
    })

    tabButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        tabButtons.forEach(b => b.classList.remove("active"))
        btn.classList.add("active")
        activeTab = btn.dataset.tab
        filterCards()
      })
    })

    function loadExample() {
      bodyInput.value = JSON.stringify(ENDPOINT_EXAMPLES[endpointSelect.value] || {}, null, 2)
      updateCurl()
    }

    function selectEndpointInConsole(path) {
      endpointSelect.value = path
      loadExample()
      const consoleEl = document.getElementById("console-section")
      if (consoleEl) {
        consoleEl.scrollIntoView({ behavior: "smooth", block: "center" })
      }
    }

    endpointSelect.addEventListener("change", loadExample)
    loadExample()

    function payload() {
      try { return JSON.parse(bodyInput.value); } catch { return {}; }
    }

    function updateCurl() {
      const savedKey = localStorage.getItem("statepulse_api_key")
      const authHeaderStr = savedKey ? "  -H \"Authorization: Bearer " + savedKey + "\" \\\\\\n" : ""
      curlCode.textContent = "curl -i -X POST \"${baseUrl}" + endpointSelect.value + "\" \\\\\\n  -H \"Content-Type: application/json\" \\\\\\n" + authHeaderStr + "  -d '" + JSON.stringify(payload()) + "'"
    }

    async function fetchChallenge() {
      updateCurl()
      consoleOutput.className = "response-loading"
      consoleOutput.textContent = "Negotiating payment challenge with resource server..."

      try {
        const headers = { "Content-Type": "application/json" }
        const savedKey = localStorage.getItem("statepulse_api_key")
        if (savedKey) {
          headers["Authorization"] = "Bearer " + savedKey
        }

        const response = await fetch(endpointSelect.value, {
          method: "POST",
          headers: headers,
          body: JSON.stringify(payload())
        })
        const challengeHeader = response.headers.get("payment-required") || response.headers.get("Payment-Required")
        const prepaidBalance = response.headers.get("X-Prepaid-Key-Balance")
        if (prepaidBalance && document.getElementById("vault-balance")) {
          document.getElementById("vault-balance").textContent = \`Prepaid Balance: \$\${prepaidBalance} USDC\`
        }

        if (response.status === 402 && challengeHeader) {
          consoleOutput.className = "response-challenge"
          let parsedChallenge = {}
          try {
            parsedChallenge = JSON.parse(atob(challengeHeader))
          } catch (e) {
            parsedChallenge = { raw: challengeHeader }
          }
          consoleOutput.textContent = "HTTP 402 Payment Required\\n\\n[payment-required header]:\\n" + JSON.stringify(parsedChallenge, null, 2)
          return
        }

        consoleOutput.className = ""
        const text = await response.text()
        try {
          consoleOutput.textContent = \`HTTP \${response.status}\\n\\n\` + JSON.stringify(JSON.parse(text), null, 2)
        } catch {
          consoleOutput.textContent = \`HTTP \${response.status}\\n\\n\` + text
        }
      } catch (err) {
        consoleOutput.className = "response-challenge"
        consoleOutput.textContent = "API Connection Error:\\n" + err.message
      }
    }

    function copyCurl() {
      updateCurl()
      navigator.clipboard.writeText(curlCode.textContent)
      alert("cURL snippet copied.")
    }

    updateCurl()

    // Vault Key claim logic
    async function claimApiKey() {
      const txHash = document.getElementById("vault-txhash").value.trim()
      const wallet = document.getElementById("vault-wallet").value.trim()
      const resultDiv = document.getElementById("vault-result")
      const keyInput = document.getElementById("vault-key")
      const balSpan = document.getElementById("vault-balance")

      if (!txHash || !wallet) {
        alert("Please enter both the deposit Transaction Hash and Wallet Address.")
        return
      }

      balSpan.textContent = "Verifying deposit on Base chain..."
      resultDiv.style.display = "flex"

      try {
        const res = await fetch("/credits/deposit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ txHash, wallet })
        })

        const data = await res.json()
        if (!res.ok || data.error) {
          balSpan.textContent = "Error: " + (data.error || "Failed to verify deposit")
          keyInput.value = ""
          return
        }

        localStorage.setItem("statepulse_api_key", data.apiKey)
        keyInput.value = data.apiKey
        balSpan.textContent = \`Prepaid Balance: \$\${Number(data.balance).toFixed(3)} USDC\`
        updateCurl()
      } catch (err) {
        balSpan.textContent = "Connection Error: " + err.message
        keyInput.value = ""
      }
    }

    function copyVaultKey() {
      const keyInput = document.getElementById("vault-key")
      if (keyInput.value) {
        navigator.clipboard.writeText(keyInput.value)
        alert("Prepaid API Key copied to clipboard. It will be automatically used in playground requests.")
      }
    }

    // Load saved API Key on load
    window.addEventListener("DOMContentLoaded", () => {
      const savedKey = localStorage.getItem("statepulse_api_key")
      if (savedKey) {
        document.getElementById("vault-result").style.display = "flex"
        document.getElementById("vault-key").value = savedKey
        document.getElementById("vault-balance").textContent = "Prepaid key loaded from browser."
      }
    })
  </script>
</body>
</html>
`
