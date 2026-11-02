import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { useRealtime } from './hooks/useRealtime.js';
import Header from './components/Header.jsx';
import Ticker from './components/Ticker.jsx';
import StatCards from './components/StatCards.jsx';
import PullPanel from './components/PullPanel.jsx';
import TradesTable from './components/TradesTable.jsx';
import Toasts from './components/Toasts.jsx';
import { fmtInt } from './utils/format.js';

const EMPTY_SUMMARY = { totalTrades: 0, totalQuantity: 0, totalValue: 0, lastUpdated: null };

export default function App() {
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [pull, setPull] = useState(null);
  const [starting, setStarting] = useState(false);
  const [ticker, setTicker] = useState([]);

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newIds, setNewIds] = useState(new Set());

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [sort, setSort] = useState({ sortBy: 'timestamp', order: 'desc' });
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');

  const [toasts, setToasts] = useState([]);

  // Latest values for use inside WebSocket callbacks (which are created once).
  const view = useRef({});
  view.current = { page, limit, sort, query, rows };
  const flashTimer = useRef();
  const refreshTimer = useRef();

  const toast = useCallback((tone, title, body) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((list) => [...list.slice(-3), { id, tone, title, body }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 6000);
  }, []);

  const loadTrades = useCallback(async ({ highlight = false } = {}) => {
    const { page: p, limit: l, sort: s, query: q, rows: before } = view.current;
    try {
      const res = await api.trades({ page: p, limit: l, q, sortBy: s.sortBy, order: s.order });
      if (highlight) {
        const known = new Set(before.map((r) => r.tradeId));
        const fresh = res.data.filter((r) => !known.has(r.tradeId)).map((r) => r.tradeId);
        if (fresh.length) {
          setNewIds(new Set(fresh));
          clearTimeout(flashTimer.current);
          flashTimer.current = setTimeout(() => setNewIds(new Set()), 4500);
        }
      }
      setRows(res.data);
      setMeta({ total: res.total, totalPages: res.totalPages });
      setError(null);
    } catch (err) {
      setError(err.message || 'Could not load trades');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSummary = useCallback(async () => {
    try {
      const res = await api.summary();
      setSummary(res.summary);
      return res;
    } catch {
      return null;
    }
  }, []);

  const loadTicker = useCallback(async () => {
    try {
      setTicker((await api.latest()).data);
    } catch {
      /* the ticker is decorative; ignore failures */
    }
  }, []);

  const refreshAll = useCallback(
    (highlight = false) => Promise.all([loadSummary(), loadTrades({ highlight }), loadTicker()]),
    [loadSummary, loadTrades, loadTicker]
  );

  // Reload the table when the view (page / sort / search / size) changes.
  useEffect(() => {
    loadTrades();
  }, [page, limit, sort, query, loadTrades]);

  // First paint comes straight from the database over REST, so it never depends on the WebSocket.
  useEffect(() => {
    loadSummary().then((res) => res && setPull((current) => current || res.pull));
    loadTicker();
  }, [loadSummary, loadTicker]);

  // Debounce the search box.
  useEffect(() => {
    const id = setTimeout(() => {
      setQuery(queryInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [queryInput]);

  // Everything below is event-driven: the server pushes, the page reacts. No polling, no refresh.
  const onMessage = useCallback(
    (msg) => {
      switch (msg.type) {
        case 'hello': // sent on every (re)connect: also resyncs anything missed while offline
          setPull(msg.pull);
          setSummary(msg.summary);
          loadTrades();
          loadTicker();
          break;
        case 'pull-started':
          setPull(msg.pull);
          toast('info', 'Pull started', 'Fetching trades in the background.');
          break;
        case 'pull-progress':
          setPull(msg.pull);
          // Show trades as they are saved, at most once every 1.5s.
          if (!refreshTimer.current) {
            refreshTimer.current = setTimeout(() => {
              refreshTimer.current = null;
              refreshAll(true);
            }, 1500);
          }
          break;
        case 'pull-completed':
          setPull(msg.pull);
          clearTimeout(refreshTimer.current);
          refreshTimer.current = null;
          refreshAll(true);
          toast(
            'success',
            'Pull completed',
            msg.pull.inserted > 0
              ? `${fmtInt(msg.pull.inserted)} new trades added. ${fmtInt(msg.totalTrades)} saved in total.`
              : 'No new trades this time. Everything was already saved.'
          );
          break;
        case 'pull-failed':
          setPull(msg.pull);
          refreshAll(true);
          toast('error', 'Pull failed', msg.pull?.error || 'Something went wrong while pulling trades.');
          break;
        default:
          break;
      }
    },
    [loadTrades, loadTicker, refreshAll, toast]
  );

  const connection = useRealtime(onMessage);

  const startPull = async (delaySeconds) => {
    setStarting(true);
    try {
      const res = await api.startPull(delaySeconds);
      setPull(res.pull);
      if (res.alreadyRunning) toast('info', 'A pull is already running', 'Showing its progress.');
    } catch (err) {
      toast('error', 'Could not start the pull', err.message);
    } finally {
      setStarting(false);
    }
  };

  const onSort = (key) => {
    setSort((s) => (s.sortBy === key ? { sortBy: key, order: s.order === 'asc' ? 'desc' : 'asc' } : { sortBy: key, order: key === 'timestamp' ? 'desc' : 'asc' }));
    setPage(1);
  };

  return (
    <div className="app">
      <Header connection={connection} />
      <Ticker trades={ticker} />
      <main className="container">
        <div className="top-grid">
          <PullPanel pull={pull} onStart={startPull} starting={starting} />
          <StatCards summary={summary} />
        </div>
        <TradesTable
          rows={rows}
          loading={loading}
          error={error}
          total={meta.total}
          page={page}
          totalPages={meta.totalPages}
          limit={limit}
          queryInput={queryInput}
          sort={sort}
          newIds={newIds}
          onQuery={setQueryInput}
          onSort={onSort}
          onPage={(p) => setPage(Math.max(1, Math.min(meta.totalPages, p)))}
          onLimit={(n) => { setLimit(n); setPage(1); }}
          onRetry={() => loadTrades()}
        />
      </main>
      <footer className="footer">BSE Trade Desk · MERN + WebSocket · built by Mayur Patil</footer>
      <Toasts toasts={toasts} onDismiss={(id) => setToasts((l) => l.filter((t) => t.id !== id))} />
    </div>
  );
}
