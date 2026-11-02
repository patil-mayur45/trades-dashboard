# Architecture

```mermaid
flowchart LR
    subgraph Browser
      UI[React dashboard]
    end
    subgraph Server["Node.js + Express"]
      API[REST API<br/>/api/*]
      WS[WebSocket gateway<br/>/ws]
      W[Background pull worker]
      BSE[Mock BSE API<br/>GET /getTrades]
    end
    DB[(MongoDB<br/>trades + pulljobs)]

    UI -- "1. open page: GET /api/summary, /api/trades (instant)" --> API
    API --> DB
    UI -- "2. POST /api/pulls (returns 202 at once)" --> API
    API -- "3. start job, do not wait" --> W
    W -- "4. many short requests (page 1..N, each &lt; 30 s)" --> BSE
    W -- "5. upsert batches (no duplicates)" --> DB
    W -- "6. progress / completed events" --> WS
    WS -- "7. push to open dashboard" --> UI
    UI -- "8. refetch saved trades" --> API
```

## Why no request lives longer than 30 seconds

| Request | Duration |
| --- | --- |
| `POST /api/pulls` | ~50 ms (answers `202`, work continues in background) |
| Worker → `GET /getTrades?page=N` | at most ~25 s (the 15 minute total is split across pages) |
| `GET /api/trades`, `/api/summary` | milliseconds, straight from MongoDB |
| `/ws` | a WebSocket (upgraded out of HTTP) with 20 s heartbeats and auto-reconnect |

## Pull lifecycle

```mermaid
stateDiagram-v2
    [*] --> running: POST /api/pulls
    running --> running: page saved, progress pushed
    running --> completed: last page saved
    running --> failed: retries exhausted / server restarted
    completed --> [*]
    failed --> [*]
```
