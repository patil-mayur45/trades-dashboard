import { Router } from 'express';
import mongoose from 'mongoose';
import Trade from '../models/Trade.js';
import PullJob from '../models/PullJob.js';
import { startPull, serializeJob } from '../services/pullWorker.js';
import { asyncHandler, clamp, escapeRegex, toInt, toNumber } from '../utils/helpers.js';

const router = Router();
const SORT_FIELDS = new Set(['timestamp', 'price', 'quantity', 'client', 'symbol', 'tradeId']);

/** Everything the dashboard needs on first paint, straight from MongoDB (never waits on the BSE API). */
export async function buildSnapshot() {
  const [agg, active, latest, lastCompleted] = await Promise.all([
    Trade.aggregate([
      {
        $group: {
          _id: null,
          totalTrades: { $sum: 1 },
          totalQuantity: { $sum: '$quantity' },
          totalValue: { $sum: { $multiply: ['$quantity', '$price'] } },
        },
      },
    ]),
    PullJob.findOne({ status: 'running' }),
    PullJob.findOne().sort({ createdAt: -1 }),
    PullJob.findOne({ status: 'completed' }).sort({ finishedAt: -1 }),
  ]);
  const s = agg[0] || { totalTrades: 0, totalQuantity: 0, totalValue: 0 };
  return {
    summary: {
      totalTrades: s.totalTrades,
      totalQuantity: s.totalQuantity,
      totalValue: s.totalValue,
      lastUpdated: lastCompleted?.finishedAt || null,
    },
    pull: serializeJob(active || latest),
  };
}

router.get('/health', (req, res) => {
  res.json({ ok: true, db: mongoose.connection.readyState === 1, time: new Date().toISOString() });
});

router.get('/summary', asyncHandler(async (req, res) => res.json(await buildSnapshot())));

router.get(
  '/trades',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, toInt(req.query.page, 1));
    const limit = clamp(toInt(req.query.limit, 25), 1, 100);
    const sortBy = SORT_FIELDS.has(req.query.sortBy) ? req.query.sortBy : 'timestamp';
    const dir = req.query.order === 'asc' ? 1 : -1;
    const q = String(req.query.q || '').trim().slice(0, 50);

    const filter = {};
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ tradeId: rx }, { client: rx }, { symbol: rx }];
    }

    const [data, total] = await Promise.all([
      Trade.find(filter)
        .select('-_id')
        .sort({ [sortBy]: dir, tradeId: dir })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Trade.countDocuments(filter),
    ]);

    res.json({ data, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
  })
);

router.get(
  '/trades/latest',
  asyncHandler(async (req, res) => {
    const limit = clamp(toInt(req.query.limit, 20), 1, 50);
    const data = await Trade.find().select('-_id').sort({ timestamp: -1 }).limit(limit).lean();
    res.json({ data });
  })
);

/** Starts a background pull and answers instantly (202). It never waits for the BSE API. */
router.post(
  '/pulls',
  asyncHandler(async (req, res) => {
    const delaySeconds = toNumber(req.body?.delaySeconds, undefined);
    const { created, job } = await startPull({ delaySeconds });
    res.status(created ? 202 : 200).json({
      message: created ? 'Trade pull started' : 'A pull is already running',
      alreadyRunning: !created,
      status: job?.status,
      pull: job,
    });
  })
);

router.get(
  '/pulls',
  asyncHandler(async (req, res) => {
    const jobs = await PullJob.find().sort({ createdAt: -1 }).limit(10);
    res.json({ data: jobs.map(serializeJob) });
  })
);

router.get(
  '/pulls/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid pull id' });
    const job = await PullJob.findById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Pull not found' });
    return res.json({ pull: serializeJob(job) });
  })
);

export default router;
