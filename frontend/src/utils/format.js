const int = new Intl.NumberFormat('en-IN');
const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 2 });

export const fmtInt = (n) => int.format(n ?? 0);
export const fmtINR = (n) => money.format(n ?? 0);
export const fmtCompactINR = (n) => `₹${compact.format(n ?? 0)}`;

export const fmtDateTime = (value) =>
  value
    ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

export function fmtDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
}

export function timeAgo(value, now = Date.now()) {
  if (!value) return 'No pull yet';
  const s = Math.max(0, Math.round((now - new Date(value).getTime()) / 1000));
  if (s < 5) return 'Just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

// Stable colour per stock symbol so the same stock always looks the same.
export function symbolHue(symbol = '') {
  let h = 0;
  for (let i = 0; i < symbol.length; i += 1) h = (h * 31 + symbol.charCodeAt(i)) % 360;
  return h;
}
