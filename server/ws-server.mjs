import http from 'http';
import { WebSocketServer } from 'ws';

const port = Number(process.env.PORT || process.env.WS_PORT || 8081);
const host = '0.0.0.0';
const heartbeatMs = Number(process.env.WS_HEARTBEAT_MS || 30000);

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('Not Found');
});

const wss = new WebSocketServer({ server, path: '/ws' });

let nextId = 1;

const broadcast = (data, except) => {
  const payload = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === 1 && client !== except) {
      client.send(payload);
    }
  });
};

wss.on('connection', (ws) => {
  ws.isAlive = true;
  const id = `p${nextId++}`;
  ws.send(JSON.stringify({ type: 'welcome', id }));

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'input' && msg.input) {
        broadcast({ type: 'input', id: msg.id || id, input: msg.input }, ws);
      }
    } catch {
      // Ignore malformed messages
    }
  });
});

const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    ws.ping();
  });
}, heartbeatMs);

server.listen(port, host);

const shutdown = () => {
  clearInterval(heartbeat);
  wss.close(() => {
    server.close(() => process.exit(0));
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
