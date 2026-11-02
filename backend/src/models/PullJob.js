import mongoose from 'mongoose';

export const LOCK_KEY = 'active-pull';

const pullJobSchema = new mongoose.Schema(
  {
    status: { type: String, enum: ['running', 'completed', 'failed'], default: 'running' },
    // Only a *running* job carries this value, and it is unique + sparse.
    // => MongoDB itself refuses a second running pull (no duplicate jobs, even across processes).
    lockKey: { type: String, default: LOCK_KEY, unique: true, sparse: true },
    delaySeconds: { type: Number, default: 0 },
    pageSize: { type: Number, default: 0 },
    totalPages: { type: Number, default: 0 },
    fetchedPages: { type: Number, default: 0 },
    totalRecords: { type: Number, default: 0 },
    inserted: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 }, // already stored (duplicates)
    invalid: { type: Number, default: 0 }, // rejected by validation
    retries: { type: Number, default: 0 },
    progress: { type: Number, default: 0 },
    error: { type: String, default: null },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

export default mongoose.model('PullJob', pullJobSchema);
