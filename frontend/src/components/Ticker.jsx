import { fmtINR } from '../utils/format.js';

export default function Ticker({ trades }) {
  if (!trades.length) {
    return (
      <div className="ticker ticker-empty" aria-label="Latest trades">
        Waiting for the first pull. Start one to see trades scroll by here.
      </div>
    );
  }
  const items = [...trades, ...trades]; // duplicated for a seamless loop
  return (
    <div className="ticker" aria-label="Latest trades">
      <div className="ticker-track">
        {items.map((t, i) => (
          <span className="tick" key={`${t.tradeId}-${i}`} aria-hidden={i >= trades.length}>
            <b>{t.symbol}</b>
            <span>{t.quantity} @ {fmtINR(t.price)}</span>
            <i>{t.client.split(' ')[0]}</i>
          </span>
        ))}
      </div>
    </div>
  );
}
