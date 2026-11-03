# BSE Trade Desk: Real-Time Trades Dashboard

A full-stack (MERN + WebSocket) dashboard that pulls trade data from a stock-exchange API in the background and shows new trades live, even when a full pull takes **15 minutes** and the network kills any HTTP request open for more than **30 seconds**.

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-47A248?logo=mongodb&logoColor=white)
![WebSocket](https://img.shields.io/badge/WebSocket-ws-FFB547)

**Live demo:** [REPLACE WITH YOUR VERCEL LINK]
**Backend health check:** https://trades-dashboard.onrender.com/api/health
*(The backend is on a free plan, so the first request after a quiet period can take up to a minute.)*

<!-- Add a screenshot at trade-dashboard/docs/screenshot.png, then remove these comment marks:
![Dashboard screenshot](trade-dashboard/docs/screenshot.png)
-->

---

## Table of contents

1. [The problem](#the-problem)
2. [The solution in one minute](#the-solution-in-one-minute)
3. [Features](#features)
4. [Architecture](#architecture)
5. [Design decisions](#design-decisions)
6. [Tech stack](#tech-stack)
7. [Getting started](#getting-started)
8. [Configuration](#configuration)
9. [API reference](#api-reference)
10. [How to test each requirement](#how-to-test-each-requirement)
11. [Project structure](#project-structure)
12. [Deployment](#deployment)
13. [Trade-offs and future work](#trade-offs-and-future-work)
14. [Author](#author)

---

## The problem

A company pulls trade data from the BSE (Bombay Stock Exchange) API.

- A full pull takes **up to 15 minutes**.
- The network drops **any HTTP connection held open longer than 30 seconds**.
- The dashboard must **open instantly** and show the trades already pulled, even while a pull is running.
- When a pull completes, new trades must appear on the open dashboard with **no page refresh, no polling loop and no cron job or scheduler**.

One long request is impossible, so the system has to be designed around short requests and background work.

## The solution in one minute

| Challenge | Approach |
| --- | --- |
| 15-minute pull vs 30-second limit | The pull is split into many short page requests. The total delay is spread across pages, so every request finishes in under 25 s. |
| Do not make the user wait | `POST /api/pulls` creates a job and returns `202` in about 50 ms. A background worker does the rest. |
| Dashboard opens instantly | The UI reads saved trades from MongoDB. It never waits for the BSE API. |
| Live updates without polling | The server **pushes** events over a WebSocket. The React app reacts to those events and reloads the data. |
| No duplicates | Unique index on `tradeId` + upsert writes. A unique lock lets only one pull run at a time. |
| Failures | Retries with exponential back-off, validation of every record, and recovery of jobs interrupted by a restart. |

## Features

- **Mock BSE API** with 5,000 seeded trades and a configurable delay (10 s up to 15 min)
- **Background pull worker** with batch fetching, progress tracking, retries and de-duplication
- **Live dashboard**: total trades, total quantity, trade value, last updated time, pull status, progress bar, elapsed time and time left
- **Trades table** with search, sorting, pagination and row highlight when new trades arrive
- **Live ticker** of the latest trades
- **Connection badge** (Live, Connecting, Reconnecting) with automatic reconnect
- **Toast notifications** for started, completed and failed pulls
- **Responsive design**: the table becomes stacked cards on phones
- **Accessible**: keyboard focus styles, ARIA labels, reduced-motion support

## Architecture

```mermaid
flowchart LR
    subgraph Browser
      UI[React dashboard]
    end
    subgraph Server["Node.js + Express"]
      API["REST API (/api)"]
      WS["WebSocket gateway (/ws)"]
      W[Background pull worker]
      BSE["Mock BSE API (GET /getTrades)"]
    end
    DB[("MongoDB: trades + pulljobs")]

    UI -- "1. open page: summary + trades (instant)" --> API
    API --> DB
    UI -- "2. POST /api/pulls (202 at once)" --> API
    API -- "3. start job, do not wait" --> W
    W -- "4. short page requests, each under 30 s" --> BSE
    W -- "5. upsert batches (no duplicates)" --> DB
    W -- "6. progress and completed events" --> WS
    WS -- "7. push to the open dashboard" --> UI
    UI -- "8. reload saved trades" --> API
```

More detail and the pull state diagram: [`trade-dashboard/docs/architecture.md`](trade-dashboard/docs/architecture.md)

### Request durations

| Request | Duration |
| --- | --- |
| `POST /api/pulls` | about 50 ms (returns `202`, work continues in the background) |
| Worker to `GET /getTrades?page=N` | at most about 25 s |
| `GET /api/trades`, `/api/summary` | milliseconds, straight from MongoDB |
| `/ws` | a WebSocket (upgraded out of HTTP) with 20 s heartbeats and auto-reconnect |

No HTTP request is ever open for 15 minutes.

## Design decisions

**Why short paged requests instead of one long request?**
A single 15-minute request cannot survive a 30-second network limit. The mock API spreads the total delay across pages, so the pull still takes 15 minutes but each request is short.

**Why a background worker that returns immediately?**
The user should never wait. The job state is stored in MongoDB, so progress survives page reloads and can be shown to any client.

**Why WebSocket and not Server-Sent Events?**
SSE is a long-lived HTTP response, which is exactly what this network kills after 30 seconds. A WebSocket is upgraded out of HTTP, is kept alive with heartbeats, and reconnects with back-off. On every connect, the server sends a full snapshot, so the dashboard cannot miss an update.

**Why is this not polling?**
There is no timer that fetches data. The browser only reacts to events pushed by the server. The only timers are a server heartbeat that keeps the socket alive (it never touches the database or the BSE API) and a UI clock for "elapsed time".

**How are duplicates prevented?**
`tradeId` has a unique index, and trades are written with `upsert + $setOnInsert`, so pulling the same trade twice is harmless. `PullJob.lockKey` is a unique sparse field that exists only while a job runs, so MongoDB itself refuses a second concurrent pull.

**Why MongoDB for job state instead of Redis and BullMQ?**
The solution runs with a single dependency and is easy to review. For several server instances, the `runPull` function can move into a BullMQ worker. The job model, retries and de-duplication stay the same.

## Tech stack

| Area | Technology |
| --- | --- |
| Frontend | React 18, Vite, custom CSS |
| Backend | Node.js 18+, Express |
| Database | MongoDB, Mongoose |
| Real-time | WebSocket (`ws` library) |
| Hosting | Vercel (frontend), Render (backend), MongoDB Atlas (database) |

## Getting started

### Prerequisites

- Node.js **18 or newer**
- A MongoDB database: [MongoDB Atlas](https://www.mongodb.com/atlas) (free), a local install, or Docker (`docker compose up -d` using the included `docker-compose.yml`)

### 1. Clone the repository

```bash
git clone https://github.com/patil-mayur45/trades-dashboard.git
cd trades-dashboard/trade-dashboard
```

### 2. Start the backend

```bash
cd backend
npm install
```

Create a file named `.env` in the `backend` folder (copy `.env.example`) and set your database address:

```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/trade-dashboard
CLIENT_ORIGIN=http://localhost:5173
BSE_DELAY_SECONDS=30
BSE_TOTAL_TRADES=5000
BSE_GROWTH_PER_MINUTE=20
```

For Atlas, use your connection string instead, with the database name added:
`mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/trade-dashboard?retryWrites=true&w=majority`

```bash
npm run dev
```

You should see `[db] connected` and `API + WebSocket on http://localhost:5000`.

### 3. Start the frontend (a second terminal)

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** and click **Start pull**.

### Troubleshooting

| Problem | Fix |
| --- | --- |
| `querySrv ECONNREFUSED` when connecting to Atlas | Your DNS blocks the lookup. Try another network, change the DNS to 8.8.8.8, or use the non-SRV `mongodb://` connection string from Atlas. |
| `bad auth` | The username or password in `MONGO_URI` is wrong. |
| Cannot connect to Atlas | In Atlas, open Network Access and allow your IP address. |
| Badge says "Reconnecting" | The backend is not running. Start it first. |
| Port 5000 already in use | Change `PORT` in `.env`, and start the frontend with `VITE_BACKEND=http://localhost:NEWPORT`. |

## Configuration

### Backend (`backend/.env`)

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `5000` | Server port |
| `MONGO_URI` | local MongoDB | Database connection string |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Allowed frontend origin(s), comma separated |
| `BSE_DELAY_SECONDS` | `30` | Total time one full pull takes. Use `900` for the 15-minute scenario |
| `BSE_TOTAL_TRADES` | `5000` | Size of the mock exchange |
| `BSE_GROWTH_PER_MINUTE` | `20` | New trades the exchange creates per minute, so later pulls find fresh data |
| `BSE_API_URL` | this server | Point to a different BSE host if needed |

### Frontend (only when the API is on another domain)

| Variable | Example |
| --- | --- |
| `VITE_API_URL` | `https://trades-dashboard.onrender.com` |
| `VITE_WS_URL` | `wss://trades-dashboard.onrender.com/ws` |

The dashboard also has a **Mock BSE delay** selector (10 s, 30 s, 2 min, 15 min), so every scenario can be demonstrated without editing files.

## API reference

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/getTrades` | **Mock BSE API.** Without paging it returns everything after the full delay, which shows why one long request cannot work. With `?page=1&limit=100&delaySeconds=900` it returns one page. |
| `GET` | `/getTrades/meta` | Instant record count |
| `GET` | `/api/summary` | Totals, last updated time and the current pull |
| `GET` | `/api/trades` | Saved trades. Query: `page`, `limit`, `q`, `sortBy`, `order` |
| `GET` | `/api/trades/latest` | Most recent trades (used by the ticker) |
| `POST` | `/api/pulls` | Start a background pull and return `202` at once. Optional body: `{ "delaySeconds": 900 }` |
| `GET` | `/api/pulls` | Recent pull history |
| `GET` | `/api/pulls/:id` | Status of one pull |
| `GET` | `/api/health` | Health check |
| `WS` | `/ws` | Events: `hello`, `pull-started`, `pull-progress`, `pull-completed`, `pull-failed`, `heartbeat` |

Example response of `POST /api/pulls`:

```json
{
  "message": "Trade pull started",
  "alreadyRunning": false,
  "status": "running",
  "pull": { "id": "…", "status": "running", "progress": 0 }
}
```

Example `/getTrades` record:

```json
{
  "tradeId": "TR00101",
  "client": "Rahul Sharma",
  "symbol": "KOTAKBANK",
  "quantity": 500,
  "price": 1780.18,
  "timestamp": "2026-11-02T04:00:00.000Z"
}
```

## How to test each requirement

| Requirement | How to check |
| --- | --- |
| Dashboard opens instantly with saved trades | Reload the page during a pull. Trades appear in milliseconds. |
| Pull starts without waiting | `POST /api/pulls` returns `202` in about 50 ms (see the Network tab). |
| No request stays open for 15 minutes | Choose **15 minutes** in the delay selector and watch the Network tab. Every request is short, and only the WebSocket stays open. |
| New trades appear automatically | Keep the page open. Rows highlight as batches are saved, and a notification appears on completion. |
| No duplicates | Run a second pull. **New trades** shows only fresh ones, and **Already saved** shows the rest. |
| Only one pull at a time | Click **Start pull** in two tabs. The second call returns the running job (`alreadyRunning: true`). |
| Error handling | Set `BSE_API_URL=http://127.0.0.1:9` to see retries and then a failed state. Stop the backend mid-pull and restart it: the job is closed as failed, and a new pull can start. |
| Why one long call fails | Open `/getTrades?delaySeconds=60`. A single request like that would be cut at 30 seconds by the network. |

## Project structure

```
trade-dashboard/
├── backend/
│   ├── src/
│   │   ├── server.js            Express and WebSocket startup
│   │   ├── config.js            Environment configuration
│   │   ├── routes/
│   │   │   ├── bse.js           Mock BSE API
│   │   │   └── api.js           Dashboard REST API
│   │   ├── services/
│   │   │   ├── pullWorker.js    Background job: batching, retries, de-duplication
│   │   │   ├── realtime.js      WebSocket gateway and heartbeat
│   │   │   └── mockData.js      Deterministic seeded trades
│   │   └── models/
│   │       ├── Trade.js
│   │       └── PullJob.js
│   └── .env.example
├── frontend/
│   └── src/
│       ├── App.jsx              State and event handling
│       ├── hooks/               useRealtime, useCountUp
│       └── components/          Header, Ticker, StatCards, PullPanel, TradesTable, Toasts
├── docs/architecture.md
└── docker-compose.yml           Optional local MongoDB
```

## Deployment

| Part | Platform | Settings |
| --- | --- | --- |
| Database | MongoDB Atlas | Allow network access, create a database user |
| Backend | Render (Web Service) | Root Directory `trade-dashboard/backend`, Build `npm install`, Start `npm start`. Set `MONGO_URI`, `CLIENT_ORIGIN`, `BSE_DELAY_SECONDS`, `BSE_TOTAL_TRADES`, `BSE_GROWTH_PER_MINUTE` |
| Frontend | Vercel | Root Directory `trade-dashboard/frontend`, Framework Vite, Build `npm run build`, Output `dist`. Set `VITE_API_URL` and `VITE_WS_URL`, then redeploy |

The frontend and backend run on different domains, so the backend allows the frontend origin through CORS, and the frontend reads the backend address from `VITE_API_URL` and `VITE_WS_URL`.

## Trade-offs and future work

- **Single server worker.** The worker runs inside the Node process. For multiple instances, move it to a BullMQ queue with Redis.
- **Free-plan hosting** sleeps after inactivity, so the first request can be slow.
- **Mock data.** The BSE API is simulated. A real integration would replace `bse.js` with calls to the exchange.
- **Possible improvements:** authentication, automated tests, resuming an interrupted pull from the last saved page, and charts per stock symbol.

## Author

**Mayur Patil**, Full Stack Web Developer, Mumbai, India

- GitHub: [patil-mayur45](https://github.com/patil-mayur45)
- LinkedIn: [Mayur Patil](https://www.linkedin.com/in/mayur-patil-0a14a541b)
- Phone: 8421722841
