import { config } from '../config.js';
import Trade from '../models/Trade.js';
import PullJob from '../models/PullJob.js';
import { broadcast } from './realtime.js';
import { clamp, sleep } from '../utils/helpers.js';

export function serializeJob(job) {
  if (!job) return null;
  const j = typeof job.toObject === 'function' ? job.toObject() : job;
  return {
    id: String(j._id),
    status: j.status,
    progress: j.progress,
    fetchedPages: j.fetchedPages,
    totalPages: j.totalPages,
    totalRecords: j.totalRecords,
    inserted: j.inserted,
    skipped: j.skipped,
    invalid: j.invalid,
    retries: j.retries,
    delaySeconds: j.delaySeconds,
    error: j.error,
    startedAt: j.startedAt,
    finishedAt: j.finishedAt,
  };
}

/** A server restart kills any in-flight worker, so its job can never finish: close it and free the lock. */
export async function recoverStaleJobs() {
  const res = await PullJob.updateMany(
    { status: 'running' },
    {
      $set: { status: 'failed', error: 'Server restarted before the pull finished', finishedAt: new Date() },
      $unset: { lockKey: 1 },
    }
  );
  if (res.modifiedCount) console.warn(`[worker] closed ${res.modifiedCount} stale pull job(s)`);
}

/**
 * Starts a pull and returns IMMEDIATELY (the HTTP request is never held open).
 * The work continues in the background; progress is pushed over WebSocket.
 */
export async function startPull({ delaySeconds } = {}) {
  const delay = clamp(Number.isFinite(delaySeconds) ? delaySeconds : config.bse.delaySeconds, 0, 3600);

  try {
    const job = await PullJob.create({ status: 'running', delaySeconds: delay, startedAt: new Date() });
    broadcast('pull-started', { pull: serializeJob(job) });
    setImmediate(() => {
      runPull(job._id).catch((err) => console.error('[worker] unexpected failure:', err));
    });
    return { created: true, job: serializeJob(job) };
  } catch (err) {
    // E11000 on the unique lock => a pull is already running. Return it instead of starting a duplicate.
    if (err?.code === 11000) {
      const running = await PullJob.findOne({ status: 'running' });
      return { created: false, job: serializeJob(running) };
    }
    throw err;
  }
}

async function bseGet(path) {
  const res = await fetch(`${config.bse.baseUrl}${path}`, {
    signal: AbortSignal.timeout(config.worker.requestTimeoutMs),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = new Error(body.error || `BSE API responded with ${res.status}`);
    error.retryable = res.status >= 500 || res.status === 429;
    throw error;
  }
  return res.json();
}

/** Every BSE call is its own short request. Transient failures are retried with exponential back-off. */
async function bseGetWithRetry(jobId, path) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await bseGet(path);
    } catch (err) {
      const retryable = err.retryable !== false; // network errors / timeouts are retryable
      if (!retryable || attempt >= config.worker.maxRetries) throw err;
      await PullJob.updateOne({ _id: jobId }, { $inc: { retries: 1 } });
      await sleep(1000 * 2 ** attempt);
    }
  }
}

function sanitize(raw) {
  const quantity = Number(raw?.quantity);
  const price = Number(raw?.price);
  const timestamp = new Date(raw?.timestamp);
  if (!raw?.tradeId || !raw?.client || !raw?.symbol) return null;
  if (!Number.isFinite(quantity) || quantity < 1 || !Number.isFinite(price) || price < 0) return null;
  if (Number.isNaN(timestamp.getTime())) return null;
  return {
    tradeId: String(raw.tradeId).trim(),
    client: String(raw.client).trim(),
    symbol: String(raw.symbol).trim().toUpperCase(),
    quantity,
    price,
    timestamp,
  };
}

async function runPull(jobId) {
  try {
    const { delaySeconds } = await PullJob.findById(jobId).lean();
    const { totalRecords } = await bseGetWithRetry(jobId, '/getTrades/meta');

    // Choose a page size so that every request stays comfortably under the 30 s network limit.
    let pageSize = config.bse.pageSize;
    const safeDelay = config.bse.maxPageDelaySeconds * 0.9;
    if (delaySeconds / Math.max(1, Math.ceil(totalRecords / pageSize)) > safeDelay) {
      pageSize = Math.ceil(totalRecords / Math.ceil(delaySeconds / safeDelay));
    }
    const totalPages = Math.ceil(totalRecords / pageSize);
    await PullJob.updateOne({ _id: jobId }, { $set: { totalRecords, pageSize, totalPages } });

    let inserted = 0;
    let skipped = 0;
    let invalid = 0;

    for (let page = 1; page <= totalPages; page += 1) {
      const body = await bseGetWithRetry(
        jobId,
        `/getTrades?page=${page}&limit=${pageSize}&delaySeconds=${delaySeconds}`
      );

      const docs = [];
      for (const raw of body.data) {
        const clean = sanitize(raw);
        if (clean) docs.push(clean);
        else invalid += 1;
      }

      if (docs.length) {
        // Upsert + $setOnInsert: re-pulling the same trade can never create a duplicate or overwrite data.
        const ops = docs.map((doc) => ({
          updateOne: { filter: { tradeId: doc.tradeId }, update: { $setOnInsert: doc }, upsert: true },
        }));
        try {
          const result = await Trade.bulkWrite(ops, { ordered: false });
          inserted += result.upsertedCount;
          skipped += docs.length - result.upsertedCount;
        } catch (err) {
          if (err?.code !== 11000 && !err?.writeErrors?.every?.((e) => e.code === 11000)) throw err;
          skipped += docs.length; // lost a race with another writer: the trades already exist
        }
      }

      const job = await PullJob.findByIdAndUpdate(
        jobId,
        {
          $set: {
            fetchedPages: page,
            progress: Math.round((page / totalPages) * 100),
            inserted,
            skipped,
            invalid,
          },
        },
        { new: true }
      );
      broadcast('pull-progress', { pull: serializeJob(job) });
    }

    const done = await PullJob.findByIdAndUpdate(
      jobId,
      { $set: { status: 'completed', progress: 100, finishedAt: new Date() }, $unset: { lockKey: 1 } },
      { new: true }
    );
    broadcast('pull-completed', { pull: serializeJob(done), totalTrades: await Trade.countDocuments() });
  } catch (err) {
    console.error('[worker] pull failed:', err.message);
    const failed = await PullJob.findByIdAndUpdate(
      jobId,
      { $set: { status: 'failed', error: err.message, finishedAt: new Date() }, $unset: { lockKey: 1 } },
      { new: true }
    );
    broadcast('pull-failed', { pull: serializeJob(failed) });
  }
}
