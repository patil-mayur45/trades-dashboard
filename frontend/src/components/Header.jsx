const LABELS = { live: 'Live', connecting: 'Connecting', reconnecting: 'Reconnecting' };

export default function Header({ connection }) {
  return (
    <header className="header">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="22" height="22">
            <path d="M6 22l7-8 5 5 8-10" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <div>
          <h1>BSE Trade Desk</h1>
          <p>Saved trades open instantly. New pulls run in the background.</p>
        </div>
      </div>
      <div className={`conn conn-${connection}`} role="status" aria-live="polite" title="WebSocket connection to the server">
        <span className="dot" />
        {LABELS[connection]}
      </div>
    </header>
  );
}
