import { Router } from 'express';
import { config } from '../config.js';
import { asyncHandler, clamp, toInt, toNumber } from '../utils/helpers.js';
import { currentTotal, tradesSlice } from '../services/mockData.js';

const router = Router();

/** Waits `ms`, but gives up immediately if the caller disconnects. Resolves false when aborted. */
function waitUnlessClosed(ms, res) {
  return new Promise((resolve) => {
    const onClose = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      res.off('close', onClose);
      resolve(true);
    }, ms);
    res.once('close', onClose);
  });
}

/** Cheap, instant call: how many trades does the exchange hold right now? */
router.get('/getTrades/meta', (req, res) => {
  res.json({ totalRecords: currentTotal(), generatedAt: new Date().toISOString() });
});

/**
 * Mock BSE API.
 *
 *  GET /getTrades                    -> ALL trades after the full delay (the "naive" call - useful to
 *                                       demonstrate why a 15 min request cannot survive a 30 s network limit)
 *  GET /getTrades?page=1&limit=100   -> one page. The total delay is spread across pages, so every
 *                                       request finishes quickly while the whole pull still takes `delay`.
 *
 *  ?delaySeconds=900  overrides BSE_DELAY_SECONDS for this call (total pull duration).
 */
router.get(
  '/getTrades',
  asyncHandler(async (req, res) => {
    const total = currentTotal();
    const delaySeconds = clamp(toNumber(req.query.delaySeconds, config.bse.delaySeconds), 0, 3600);
    const paged = req.query.page !== undefined || req.query.limit !== undefined;

    if (!paged) {
      const alive = await waitUnlessClosed(delaySeconds * 1000, res);
      if (!alive) return undefined;
      return res.json(tradesSlice(0, total));
    }

    const limit = clamp(toInt(req.query.limit, config.bse.pageSize), 1, 1000);
    const page = Math.max(1, toInt(req.query.page, 1));
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const perPageDelay = delaySeconds / totalPages;

    if (perPageDelay > config.bse.maxPageDelaySeconds) {
      return res.status(400).json({
        error: `Each page would take ${perPageDelay.toFixed(1)}s, which risks the 30s network limit. Use a smaller "limit" (more pages).`,
      });
    }

    const alive = await waitUnlessClosed(perPageDelay * 1000, res);
    if (!alive) return undefined;

    const start = (page - 1) * limit;
    const count = Math.max(0, Math.min(limit, total - start));
    return res.json({ page, limit, totalPages, totalRecords: total, data: tradesSlice(start, count) });
  })
);

export default router;
