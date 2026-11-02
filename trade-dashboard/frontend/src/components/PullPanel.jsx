import { useState } from 'react';
import { useNow } from '../hooks/useCountUp.js';
import { fmtDuration, fmtInt } from '../utils/format.js';

const DELAYS = [
  { value: '', label: 'Server default' },
  { value: 10, label: '10 seconds (quick test)' },
  { value: 30, label: '30 seconds (timeout test)' },
  { value: 120, label: '2 minutes' },
  { value: 900, label: '15 minutes (real scenario)' },
];

const STATUS = {
  idle: { label: 'Ready', hint: 'No pull has run yet.' },
  running: { label: 'Pull running', hint: 'Fetching in small batches. You can keep using the dashboard.' },
  completed: { label: 'Completed', hint: 'All trades are saved.' },
  failed: { label: 'Failed', hint: 'The pull stopped. Trades saved so far are kept.' },
};

export default function PullPanel({ pull, onStart, starting }) {
  const [delay, setDelay] = useState('');
  const status = pull?.status || 'idle';
  const running = status === 'running';
  const now = useNow(running);

  const started = pull?.startedAt ? new Date(pull.startedAt).getTime() : null;
  const ended = pull?.finishedAt ? new Date(pull.finishedAt).getTime() : null;
  const elapsed = started ? (running ? now : ended || now) - started : 0;
  const eta = running && pull.progress > 0 ? (elapsed * (100 - pull.progress)) / pull.progress : null;

  return (
    <section className="card pull" aria-label="Trade pull">
      <div className="pull-top">
        <div>
          <span className={`chip chip-${status}`}>
            <span className="dot" />
            {STATUS[status].label}
          </span>
          <p className="pull-hint" role="status" aria-live="polite">
            {status === 'failed' && pull?.error ? pull.error : STATUS[status].hint}
          </p>
        </div>

        <div className="pull-actions">
          <label className="select">
            <span>Mock BSE delay</span>
            <select value={delay} onChange={(e) => setDelay(e.target.value)} disabled={running || starting}>
              {DELAYS.map((d) => (
                <option key={d.label} value={d.value}>{d.label}</option>
              ))}
            </select>
          </label>
          <button className="btn" onClick={() => onStart(delay ? Number(delay) : undefined)} disabled={running || starting}>
            {running || starting ? <span className="spinner" aria-hidden="true" /> : null}
            {running ? 'Pulling…' : starting ? 'Starting…' : status === 'failed' ? 'Retry pull' : 'Start pull'}
          </button>
        </div>
      </div>

      <div
        className={`bar ${running ? 'bar-running' : ''} bar-${status}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pull?.progress || 0}
        aria-label="Pull progress"
      >
        <div className="bar-fill" style={{ width: `${pull?.progress || 0}%` }} />
      </div>

      <dl className="pull-meta">
        <div><dt>Progress</dt><dd>{pull?.progress || 0}%</dd></div>
        <div><dt>Batch</dt><dd>{pull?.totalPages ? `${pull.fetchedPages} of ${pull.totalPages}` : '—'}</dd></div>
        <div><dt>New trades</dt><dd>{fmtInt(pull?.inserted)}</dd></div>
        <div><dt>Already saved</dt><dd>{fmtInt(pull?.skipped)}</dd></div>
        <div><dt>{running ? 'Elapsed' : 'Took'}</dt><dd>{started ? fmtDuration(elapsed) : '—'}</dd></div>
        <div><dt>Time left</dt><dd>{running ? (eta ? fmtDuration(eta) : 'estimating…') : '—'}</dd></div>
      </dl>
    </section>
  );
}
