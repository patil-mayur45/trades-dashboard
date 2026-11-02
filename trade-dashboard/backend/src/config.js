import 'dotenv/config';

const num = (value, fallback) => {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const port = num(process.env.PORT, 5000);

export const config = {
  port,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/trade-dashboard',
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()),
  bse: {
    baseUrl: process.env.BSE_API_URL || `http://127.0.0.1:${port}`,
    totalTrades: num(process.env.BSE_TOTAL_TRADES, 5000),
    delaySeconds: num(process.env.BSE_DELAY_SECONDS, 30),
    growthPerMinute: num(process.env.BSE_GROWTH_PER_MINUTE, 20),
    pageSize: 100,
    // Every single HTTP request must finish well inside the network's 30s limit.
    maxPageDelaySeconds: 25,
  },
  worker: {
    maxRetries: 3,
    requestTimeoutMs: 28_000,
  },
};
