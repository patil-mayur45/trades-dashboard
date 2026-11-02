import { useCountUp, useNow } from '../hooks/useCountUp.js';
import { fmtCompactINR, fmtDateTime, fmtInt, timeAgo } from '../utils/format.js';

function Stat({ label, value, hint, tone }) {
  return (
    <div className={`card stat stat-${tone}`}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      <span className="stat-hint">{hint}</span>
    </div>
  );
}

export default function StatCards({ summary }) {
  const trades = useCountUp(summary.totalTrades);
  const quantity = useCountUp(summary.totalQuantity);
  const value = useCountUp(Math.round(summary.totalValue));
  const now = useNow(true, 15_000);

  return (
    <section className="stats" aria-label="Summary">
      <Stat tone="saffron" label="Total trades" value={fmtInt(trades)} hint="saved in the database" />
      <Stat tone="sky" label="Total quantity" value={fmtInt(quantity)} hint="shares traded" />
      <Stat tone="mint" label="Trade value" value={fmtCompactINR(value)} hint="quantity × price" />
      <Stat
        tone="violet"
        label="Last updated"
        value={timeAgo(summary.lastUpdated, now)}
        hint={summary.lastUpdated ? fmtDateTime(summary.lastUpdated) : 'start a pull to load trades'}
      />
    </section>
  );
}
