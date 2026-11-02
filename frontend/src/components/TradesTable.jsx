import { fmtDateTime, fmtInt, fmtINR, symbolHue } from '../utils/format.js';

const COLUMNS = [
  { key: 'tradeId', label: 'Trade ID' },
  { key: 'client', label: 'Client' },
  { key: 'symbol', label: 'Symbol' },
  { key: 'quantity', label: 'Quantity', numeric: true },
  { key: 'price', label: 'Price', numeric: true },
  { key: 'timestamp', label: 'Trade time' },
];

export default function TradesTable({
  rows, loading, error, total, page, totalPages, limit, queryInput, sort, newIds,
  onQuery, onSort, onPage, onLimit, onRetry,
}) {
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);

  return (
    <section className="card table-card" aria-label="Trades">
      <div className="table-tools">
        <h2>Trades <span className="count">{fmtInt(total)}</span></h2>
        <label className="search">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M20 20l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            placeholder="Search client, symbol or trade ID"
            value={queryInput}
            onChange={(e) => onQuery(e.target.value)}
            aria-label="Search trades"
          />
        </label>
      </div>

      {error ? (
        <div className="empty">
          <p>{error}</p>
          <button className="btn btn-ghost" onClick={onRetry}>Try again</button>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    className={c.numeric ? 'num' : ''}
                    aria-sort={sort.sortBy === c.key ? (sort.order === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button className="th-btn" onClick={() => onSort(c.key)}>
                      {c.label}
                      <span className={`caret ${sort.sortBy === c.key ? 'on' : ''}`}>
                        {sort.sortBy === c.key && sort.order === 'asc' ? '▲' : '▼'}
                      </span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0
                ? Array.from({ length: 8 }, (_, i) => (
                    <tr key={i} className="skeleton-row" aria-hidden="true">
                      {COLUMNS.map((c) => <td key={c.key}><span className="skeleton" /></td>)}
                    </tr>
                  ))
                : rows.map((t) => (
                    <tr key={t.tradeId} className={newIds.has(t.tradeId) ? 'is-new' : ''}>
                      <td data-label="Trade ID" className="id">{t.tradeId}</td>
                      <td data-label="Client">{t.client}</td>
                      <td data-label="Symbol">
                        <span className="symbol" style={{ '--h': symbolHue(t.symbol) }}>{t.symbol}</span>
                      </td>
                      <td data-label="Quantity" className="num">{fmtInt(t.quantity)}</td>
                      <td data-label="Price" className="num">{fmtINR(t.price)}</td>
                      <td data-label="Trade time" className="time">{fmtDateTime(t.timestamp)}</td>
                    </tr>
                  ))}
            </tbody>
          </table>

          {!loading && rows.length === 0 && (
            <div className="empty">
              <strong>{queryInput ? 'No trades match your search' : 'No trades saved yet'}</strong>
              <p>{queryInput ? 'Try a different client, symbol or trade ID.' : 'Press “Start pull” to fetch trades from the BSE API.'}</p>
            </div>
          )}
        </div>
      )}

      <div className="pager">
        <span className="pager-info">{fmtInt(from)}–{fmtInt(to)} of {fmtInt(total)}</span>
        <label className="select select-inline">
          <span>Rows</span>
          <select value={limit} onChange={(e) => onLimit(Number(e.target.value))}>
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <div className="pager-btns">
          <button className="btn btn-ghost" onClick={() => onPage(page - 1)} disabled={page <= 1}>Previous</button>
          <span className="pager-page">Page {page} of {totalPages}</span>
          <button className="btn btn-ghost" onClick={() => onPage(page + 1)} disabled={page >= totalPages}>Next</button>
        </div>
      </div>
    </section>
  );
}
