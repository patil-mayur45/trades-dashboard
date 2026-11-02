import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
import http from 'http';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { config } from './config.js';
import Trade from './models/Trade.js';
import PullJob from './models/PullJob.js';
import bseRouter from './routes/bse.js';
import apiRouter, { buildSnapshot } from './routes/api.js';
import { initRealtime, closeRealtime } from './services/realtime.js';
import { recoverStaleJobs } from './services/pullWorker.js';

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: config.clientOrigins }));
app.use(express.json({ limit: '100kb' }));

app.use(bseRouter); // GET /getTrades (mock BSE exchange)
app.use('/api', apiRouter);

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[http]', err);
  res.status(500).json({ error: 'Something went wrong on the server' });
});

async function main() {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
  console.log('[db] connected');

  // Make sure the unique indexes exist BEFORE any pull runs (they are what prevent duplicates).
  await Promise.all([Trade.init(), PullJob.init()]);
  await recoverStaleJobs();

  const server = http.createServer(app);
  initRealtime(server, buildSnapshot);

  server.listen(config.port, () => {
    const perPage = config.bse.delaySeconds / Math.ceil(config.bse.totalTrades / config.bse.pageSize);
    console.log(`[http] API + WebSocket on http://localhost:${config.port}`);
    console.log(
      `[bse ] mock exchange: ${config.bse.totalTrades} trades, full pull ≈ ${config.bse.delaySeconds}s ` +
        `(~${perPage.toFixed(1)}s per request, limit 30s)`
    );
  });

  const shutdown = async (signal) => {
    console.log(`\n[sys] ${signal} received, shutting down`);
    closeRealtime();
    server.close();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[sys] failed to start:', err.message);
  console.error('      Is MongoDB running? Check MONGO_URI in backend/.env');
  process.exit(1);
});
