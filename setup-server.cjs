const http = require('http');
const { spawn } = require('child_process');
const { exec } = require('child_process');

const PORT = 8088;

// Auto-open browser helper
function openBrowser(url) {
  const start = process.platform === 'darwin' ? 'open' :
                process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${start} ${url}`, (err) => {
    if (err) console.log(`Please open your browser to: ${url}`);
  });
}

// Function to run a command with piped input (e.g. wrangler secret put)
function setSecret(key, value, cloudflareToken, logCallback) {
  return new Promise((resolve, reject) => {
    logCallback(`[Config] Setting secret ${key}...\n`);
    const trimmedValue = value.trim();
    
    let cmdStr = '';
    if (process.platform === 'win32') {
      cmdStr = `echo ${trimmedValue}|npx wrangler secret put ${key}`;
    } else {
      cmdStr = `echo "${trimmedValue}" | npx wrangler secret put ${key}`;
    }

    const env = { ...process.env, CLOUDFLARE_API_TOKEN: cloudflareToken };

    exec(cmdStr, { env }, (error, stdout, stderr) => {
      if (stdout) logCallback(`[Wrangler] ${stdout}`);
      if (stderr) logCallback(`[Wrangler Output] ${stderr}`);
      
      if (error) {
        reject(new Error(`Setting secret ${key} failed: ${error.message}`));
      } else {
        logCallback(`[Config] Secret ${key} set successfully.\n\n`);
        resolve();
      }
    });
  });
}

// Function to run wrangler deploy and capture outputs
function runDeploy(cloudflareToken, logCallback) {
  return new Promise((resolve, reject) => {
    logCallback('[Config] Starting deployment to Cloudflare...\n');
    const isWin = process.platform === 'win32';
    const cmd = isWin ? 'npx.cmd' : 'npx';
    const env = { ...process.env, CLOUDFLARE_API_TOKEN: cloudflareToken };
    const child = spawn(cmd, ['wrangler', 'deploy'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
      env
    });

    let output = '';

    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      logCallback(chunk);
    });

    child.stderr.on('data', (data) => {
      logCallback(data.toString());
    });

    child.on('close', (code) => {
      if (code === 0) {
        logCallback('\n[Config] Deployment complete.\n');
        resolve(output);
      } else {
        reject(new Error(`wrangler deploy failed with exit code ${code}`));
      }
    });
  });
}

// HTML setup dashboard
const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>StatePulse API - Local Setup Wizard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Space+Mono&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-dark: #07050f;
      --card-bg: rgba(18, 14, 36, 0.6);
      --accent-color: #6d28d9;
      --accent-glow: rgba(109, 40, 217, 0.4);
      --accent-light: #a78bfa;
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
      --border-color: rgba(139, 92, 246, 0.15);
      --success-color: #10b981;
      --error-color: #ef4444;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg-dark);
      background-image: 
        radial-gradient(circle at 10% 20%, rgba(109, 40, 217, 0.15) 0%, transparent 40%),
        radial-gradient(circle at 90% 80%, rgba(79, 70, 229, 0.15) 0%, transparent 40%);
      color: var(--text-main);
      font-family: 'Outfit', sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem 1rem;
    }

    .container {
      width: 100%;
      max-width: 600px;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    header {
      text-align: center;
      margin-bottom: 1rem;
    }

    h1 {
      font-size: 2.25rem;
      font-weight: 700;
      letter-spacing: -0.025em;
      background: linear-gradient(to right, #ffffff, var(--accent-light));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 0.5rem;
    }

    .subtitle {
      color: var(--text-muted);
      font-size: 1rem;
    }

    .card {
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--border-color);
      border-radius: 20px;
      padding: 2rem;
      box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.4);
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-bottom: 1.25rem;
    }

    label {
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    input {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 0.85rem 1rem;
      color: white;
      font-family: 'Outfit', sans-serif;
      font-size: 1rem;
      transition: all 0.2s ease;
      width: 100%;
    }

    input:focus {
      outline: none;
      border-color: var(--accent-light);
      background: rgba(255, 255, 255, 0.05);
      box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.15);
    }

    .btn {
      font-family: 'Outfit', sans-serif;
      font-weight: 600;
      font-size: 1rem;
      padding: 0.9rem 1.5rem;
      border-radius: 12px;
      border: none;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      transition: all 0.2s ease;
      width: 100%;
      background: linear-gradient(135deg, var(--accent-color) 0%, #4f46e5 100%);
      color: white;
      box-shadow: 0 4px 14px 0 rgba(109, 40, 217, 0.4);
      margin-top: 0.5rem;
    }

    .btn:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px 0 rgba(109, 40, 217, 0.6);
      filter: brightness(1.1);
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .console-card {
      display: none;
      background: #04020a;
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 16px;
      padding: 1.25rem;
      font-family: 'Space Mono', monospace;
      font-size: 0.85rem;
      max-height: 250px;
      overflow-y: auto;
      white-space: pre-wrap;
      color: #34d399;
    }

    .status-text {
      text-align: center;
      font-size: 0.95rem;
      color: var(--text-muted);
      margin-top: 0.5rem;
      display: none;
    }

    .url-result {
      display: none;
      background: rgba(16, 185, 129, 0.07);
      border: 1px solid rgba(16, 185, 129, 0.2);
      border-radius: 12px;
      padding: 1rem;
      text-align: center;
      margin-top: 1rem;
      font-weight: 500;
    }

    .url-result a {
      color: #34d399;
      text-decoration: none;
      word-break: break-all;
    }

    .url-result a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>StatePulse API</h1>
      <p class="subtitle">Cloudflare Worker Deployment Wizard</p>
    </header>

    <div class="card">
      <form id="setup-form" onsubmit="submitForm(event)">
        <div class="form-group">
          <label for="wallet-address">MetaMask Wallet Address (Base Network)</label>
          <input type="text" id="wallet-address" placeholder="0x..." required pattern="^0x[a-fA-F0-9]{40}$" title="Must start with 0x followed by 40 hex characters">
        </div>

        <div class="form-group">
          <label for="cloudflare-token">Cloudflare API Token</label>
          <input type="password" id="cloudflare-token" placeholder="Paste your API token..." required>
          <span style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.25rem; line-height: 1.4; display: block;">
            Create a token with the "Edit Cloudflare Workers" template at <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" style="color: var(--accent-light); text-decoration: underline;">dash.cloudflare.com</a>
          </span>
        </div>

        <button type="submit" id="submit-btn" class="btn">Deploy to Cloudflare</button>
      </form>

      <div id="status-text" class="status-text">Initializing deployment...</div>
      <div id="console" class="console-card"></div>
      <div id="url-result" class="url-result">
        Setup complete. Access your live web interface:<br><br>
        <a id="live-url" href="" target="_blank"></a>
      </div>
    </div>
  </div>

  <script>
    async function submitForm(e) {
      e.preventDefault();
      
      const wallet = document.getElementById('wallet-address').value.trim();
      const token = document.getElementById('cloudflare-token').value.trim();
      
      document.getElementById('submit-btn').disabled = true;
      document.getElementById('status-text').style.display = 'block';
      
      const consoleBox = document.getElementById('console');
      consoleBox.style.display = 'block';
      consoleBox.innerText = 'Connecting to setup server...\\n';

      try {
        const response = await fetch('/api/deploy', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ walletAddress: wallet, cloudflareToken: token })
        });

        // Set up streaming response reader
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          consoleBox.innerText += text;
          consoleBox.scrollTop = consoleBox.scrollHeight;
        }

        // Find the URL in console logs
        const match = consoleBox.innerText.match(/https:\\/\\/[^ ]*workers\\.dev/);
        if (match) {
          const url = match[0];
          document.getElementById('live-url').innerText = url;
          document.getElementById('live-url').href = url;
          document.getElementById('url-result').style.display = 'block';
          document.getElementById('status-text').innerText = 'Deployment Succeeded!';
        } else {
          document.getElementById('status-text').innerText = 'Deployment finished, verify output above.';
        }

      } catch (err) {
        consoleBox.innerText += '\\n[Error] Deployment failed: ' + err.message;
        document.getElementById('status-text').innerText = 'Deployment Failed';
        document.getElementById('submit-btn').disabled = false;
      }
    }
  </script>
</body>
</html>
`;

// Start local HTTP server
const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } 
  else if (req.method === 'POST' && req.url === '/api/deploy') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { walletAddress, cloudflareToken } = JSON.parse(body);

        if (!walletAddress || !cloudflareToken) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing credentials' }));
          return;
        }

        res.writeHead(200, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Transfer-Encoding': 'chunked'
        });

        const logCallback = (data) => {
          res.write(data);
        };

        try {
          // 1. Set secrets
          await setSecret('WALLET_ADDRESS', walletAddress, cloudflareToken, logCallback);

          // 2. Run Deploy
          await runDeploy(cloudflareToken, logCallback);
          res.end();
        } catch (err) {
          res.write(`\n❌ Error: ${err.message}\n`);
          res.end();
        }
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  } 
  else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n==================================================`);
  console.log(`🚀 Setup server listening on ${url}`);
  console.log(`==================================================\n`);
  openBrowser(url);
});
