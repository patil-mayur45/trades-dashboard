# BSE Trade Desk – Real-Time Trades Dashboard

A full-stack (MERN) solution to the assessment scenario:

> A full pull of BSE trade data takes up to **15 minutes**, but the network kills any HTTP connection open longer than **30 seconds**. The dashboard must open instantly, and when a pull finishes the new trades must appear on the open page with **no refresh, no polling loop and no cron job**.

**Stack:** React (Vite) · Node.js · Express · MongoDB (Mongoose) · WebSocket (`ws`)

---

## How the problem is solved

1. **Mock BSE API** – `GET /getTrades` serves 5,000 seeded trades. The *total* pull time is configurable (`BSE_DELAY_SECONDS`, `900` = 15 min) and is **spread across pages**, so every single HTTP request finishes in under ~25 s while the whole pull still takes 15 minutes.
2. **Background pull** – `POST /api/pulls` creates a job in MongoDB and **returns `202` immediately**. A worker then fetches page after page, upserts each batch into MongoDB and records progress. No request is ever held open for 15 minutes.
3. **Instant dashboard** – the page loads from MongoDB (`/api/summary`, `/api/trades`) and never waits for the BSE API, even while a pull is running.
4. **Automatic updates, no polling** – the server **pushes** `pull-progress` / `pull-completed` events over a **WebSocket**. The React app reacts to those events and reloads the saved trades. There is no `setInterval` fetching data and no cron/scheduler. (The only timers are a server heartbeat that keeps the socket alive and a UI clock for "elapsed time".)
5. **No duplicates** –
   * `tradeId` has a **unique index**, and trades are written with `upsert + $setOnInsert`, so pulling the same trade twice is harmless.
   * `PullJob.lockKey` is a **unique sparse** field that exists only while a job is running, so MongoDB itself refuses a second concurrent pull (the API returns the already-running job instead).
6. **Failure handling** – every BSE call is retried 3× with exponential back-off; invalid records are counted and skipped; a failed pull keeps the trades already saved; jobs left "running" by a crash are closed on the next start; the browser auto-reconnects and receives a fresh snapshot.

### Why WebSocket and not SSE?
SSE is a *long-lived HTTP response*, which is exactly what this network kills after 30 s (the browser would reconnect over and over). A WebSocket is upgraded out of HTTP, is kept alive with heartbeats, and reconnects with back-off. On every (re)connect the server sends a full snapshot, so nothing is ever missed. If your network also blocks long-lived WebSockets, the fallback would be to ask the company which real-time transport is allowed.

### Why no Redis / BullMQ?
The brief lists BullMQ + Redis as one option. This project uses an in-process worker backed by MongoDB so it runs with a single dependency (MongoDB) and is easy to review. Job state lives in MongoDB, so progress survives page reloads. For multiple server instances, move `runPull` into a BullMQ worker – the job model, retry logic and de-duplication stay the same.

---

## Architecture

See [`docs/architecture.md`](docs/architecture.md) (Mermaid diagrams render on GitHub).

```
React dashboard ──REST──▶ Express ──▶ MongoDB (trades, pulljobs)
       ▲                     │
       │ WebSocket push      ▼
       └────────────── Background worker ──▶ Mock BSE API (page 1..N, each < 30 s)
```

---

## Run it locally

**Requirements:** Node.js 18+ and MongoDB (local install, or `docker compose up -d` using the included file).

```bash
# 1) Backend
cd backend
cp .env.example .env        # Windows: copy .env.example .env
npm install
npm run dev                 # http://localhost:5000

# 2) Frontend (new terminal)
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

Open **http://localhost:5173** and press **Start pull**.

### Configuration (`backend/.env`)

| Variable | Default | Meaning |
| --- | --- | --- |
| `BSE_DELAY_SECONDS` | `30` | Total time one full pull takes. Set `900` for the 15 minute scenario |
| `BSE_TOTAL_TRADES` | `5000` | Size of the mock exchange |
| `BSE_GROWTH_PER_MINUTE` | `20` | New trades the exchange creates per minute, so later pulls find fresh data |
| `MONGO_URI` | local MongoDB | Database connection |
| `BSE_API_URL` | this server | Point to a different BSE host if needed |

The dashboard also has a **Mock BSE delay** selector (10 s, 30 s, 2 min, 15 min) so you can demo every scenario without editing files.

---

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/getTrades` | **Mock BSE API.** Without paging it returns everything after the full delay (shows why one long request cannot work). With `?page=1&limit=100&delaySeconds=900` it returns one page |
| `GET` | `/getTrades/meta` | Instant record count |
| `GET` | `/api/summary` | Totals, last updated, current pull |
| `GET` | `/api/trades` | Saved trades. Query: `page`, `limit`, `q`, `sortBy`, `order` |
| `GET` | `/api/trades/latest` | Most recent trades (ticker) |
| `POST` | `/api/pulls` | Start a background pull → `202` immediately. Body: `{ "delaySeconds": 900 }` (optional) |
| `GET` | `/api/pulls` / `/api/pulls/:id` | Pull history / status |
| `GET` | `/api/health` | Health check |
| `WS` | `/ws` | Events: `hello`, `pull-started`, `pull-progress`, `pull-completed`, `pull-failed`, `heartbeat` |

Example response of `POST /api/pulls` (arrives in ~50 ms):

```json
{ "message": "Trade pull started", "alreadyRunning": false, "status": "running", "pull": { "id": "…", "progress": 0 } }
```

---

## How to test (matches the assessment checklist)

| Check | How |
| --- | --- |
| Dashboard opens instantly with saved trades | Reload the page during a pull; trades appear in milliseconds |
| Pull starts without waiting | `POST /api/pulls` returns `202` in ~50 ms (see the Network tab) |
| No request stays open for 15 min | Set the delay to **15 minutes** and watch the Network tab: every request is short, only the WebSocket stays open |
| New trades appear automatically | Keep the page open; rows highlight as batches are saved and a toast appears on completion |
| No duplicates | Run a second pull: *New trades* shows only the fresh ones, *Already saved* shows the rest. Total never double counts |
| Concurrent pull protection | Click Start pull in two tabs, or `curl -X POST` twice: the second call returns the running job (`alreadyRunning: true`) |
| Error handling | Stop the backend mid-pull and restart: the job is closed as failed, a new pull can start. Set `BSE_API_URL=http://127.0.0.1:9` to see retries then a failed state |
| Why a single call fails | Open `http://localhost:5000/getTrades?delaySeconds=60` – that one request would be cut at 30 s by the network |

---

## Project structure

```
trade-dashboard/
├── backend/
│   └── src/
│       ├── server.js              # Express + WebSocket bootstrap
│       ├── config.js
│       ├── routes/  bse.js        # mock BSE API
│       │            api.js        # dashboard REST API
│       ├── services/ pullWorker.js   # background job, batching, retries, de-duplication
│       │             realtime.js    # WebSocket gateway + heartbeat
│       │             mockData.js    # deterministic seeded trades
│       └── models/  Trade.js, PullJob.js
├── frontend/
│   └── src/
│       ├── App.jsx                # state + event handling
│       ├── hooks/ useRealtime.js, useCountUp.js
│       └── components/ Header, Ticker, StatCards, PullPanel, TradesTable, Toasts
├── docs/architecture.md
└── docker-compose.yml             # optional MongoDB
```

## Deploying
Backend: any Node host (Render, Railway, a VPS) with a MongoDB Atlas URI in `MONGO_URI`. The backend allows the local frontend and `https://frontend-j5apl2n4c-web-plan.vercel.app` by default; set `CLIENT_ORIGIN` to add comma-separated frontend origins for your deployment. Frontend: `npm run build`, host `dist/` (Vercel/Netlify) with `VITE_API_URL` and `VITE_WS_URL` (`wss://…/ws`) pointing at the backend.

---
Built by **Mayur Patil** · [GitHub](https://github.com/patil-mayur45)
