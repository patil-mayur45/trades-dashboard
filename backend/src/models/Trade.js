import mongoose from 'mongoose';

const tradeSchema = new mongoose.Schema(
  {
    // unique index = the database itself guarantees no duplicate trades, even under concurrency
    tradeId: { type: String, required: true, unique: true, trim: true },
    client: { type: String, required: true, trim: true },
    symbol: { type: String, required: true, trim: true, uppercase: true },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    timestamp: { type: Date, required: true },
  },
  { versionKey: false }
);

tradeSchema.index({ timestamp: -1 });

export default mongoose.model('Trade', tradeSchema);
