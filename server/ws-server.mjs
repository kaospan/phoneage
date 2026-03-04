import { WebSocketServer } from 'ws';

const port = Number(process.env.WS_PORT || 8081);
const wss = new WebSocketServer({ port });

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
  const id = `p${nextId++}`;
  ws.send(JSON.stringify({ type: 'welcome', id }));

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'input' && msg.input) {
        broadcast({ type: 'input', id: msg.id || id, input: msg.input }, ws);
      }
    } catch (err) {
      // Ignore malformed messages
    }
  });
});

console.log(`WebSocket server listening on ws://localhost:${port}`);
