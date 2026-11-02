import { WebSocketServer, WebSocket } from 'ws';

let wss = null;

/**
 * WebSocket gateway.
 * Unlike a long-lived HTTP response (SSE / long-poll), a WebSocket is upgraded out of HTTP and kept
 * alive with heartbeats, so it is the safer choice when a proxy drops HTTP requests after 30 s.
 */
export function initRealtime(server, getSnapshot) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    ws.on('error', () => {});

    try {
      // On every (re)connect the client gets the current state, so it can never miss an update.
      ws.send(JSON.stringify({ type: 'hello', ...(await getSnapshot()) }));
    } catch (err) {
      console.error('[ws] failed to send snapshot:', err.message);
    }
  });

  // Connection keep-alive only (protocol ping + an app-level heartbeat the browser can observe).
  // This is NOT a data-polling loop: it never touches the database or the BSE API.
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) {
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'heartbeat', at: Date.now() }));
    });
  }, 20_000);

  wss.on('close', () => clearInterval(heartbeat));
  return wss;
}

export function broadcast(type, payload = {}) {
  if (!wss) return;
  const message = JSON.stringify({ type, ...payload });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  });
}

export function closeRealtime() {
  wss?.clients.forEach((c) => c.terminate());
  wss?.close();
}
