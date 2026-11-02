import { useEffect, useRef, useState } from 'react';

const WS_URL =
  import.meta.env.VITE_WS_URL || `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;

/**
 * One WebSocket for the whole page. Reconnects with exponential back-off, and treats a silent
 * connection (no heartbeat for 50s) as dead. The server re-sends a full snapshot on every reconnect,
 * so a dropped connection can never leave the dashboard stale.
 */
export function useRealtime(onMessage) {
  const [status, setStatus] = useState('connecting'); // connecting | live | reconnecting
  const handler = useRef(onMessage);

  useEffect(() => {
    handler.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    let ws;
    let retry = 0;
    let retryTimer;
    let watchdog;
    let closedByUs = false;

    const armWatchdog = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => ws?.close(), 50_000);
    };

    const connect = () => {
      setStatus(retry === 0 ? 'connecting' : 'reconnecting');
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        retry = 0;
        setStatus('live');
        armWatchdog();
      };
      ws.onmessage = (event) => {
        armWatchdog();
        try {
          handler.current(JSON.parse(event.data));
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        clearTimeout(watchdog);
        if (closedByUs) return;
        setStatus('reconnecting');
        retry += 1;
        retryTimer = setTimeout(connect, Math.min(1000 * 2 ** retry, 15_000));
      };
      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      closedByUs = true;
      clearTimeout(retryTimer);
      clearTimeout(watchdog);
      ws?.close();
    };
  }, []);

  return status;
}
