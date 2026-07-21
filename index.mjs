import readline from 'node:readline';

// Lightweight zero-dependency stdio MCP server for Glama introspection and verification
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', (line) => {
  if (!line.trim()) return;
  try {
    const req = JSON.parse(line);
    if (req.method === 'initialize') {
      const res = {
        jsonrpc: '2.0',
        id: req.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'statepulse-api', version: '1.0.0' }
        }
      };
      process.stdout.write(JSON.stringify(res) + '\n');
    } else if (req.method === 'notifications/initialized') {
      // Notification acknowledgment (no response needed)
    } else if (req.method === 'tools/list') {
      const res = {
        jsonrpc: '2.0',
        id: req.id,
        result: {
          tools: [
            {
              name: 'statepulse_live_telemetry',
              description: 'Access pay-per-call live telemetry, environmental metrics, and real-time utilities via StatePulse API (x402 USDC on Base). Live remote endpoint: https://statepulse-api.hahavoid0.workers.dev/mcp',
              inputSchema: { type: 'object', properties: {} }
            }
          ]
        }
      };
      process.stdout.write(JSON.stringify(res) + '\n');
    } else if (req.id !== undefined) {
      const res = {
        jsonrpc: '2.0',
        id: req.id,
        result: {}
      };
      process.stdout.write(JSON.stringify(res) + '\n');
    }
  } catch (err) {
    // Ignore non-JSON lines
  }
});
