const BASE = import.meta.env.VITE_API_URL || '';

async function request(path, options) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

export const api = {
  summary: () => request('/api/summary'),
  trades: ({ page, limit, q, sortBy, order }) => {
    const params = new URLSearchParams({ page, limit, sortBy, order });
    if (q) params.set('q', q);
    return request(`/api/trades?${params}`);
  },
  latest: () => request('/api/trades/latest?limit=24'),
  startPull: (delaySeconds) =>
    request('/api/pulls', {
      method: 'POST',
      body: JSON.stringify(delaySeconds ? { delaySeconds } : {}),
    }),
};
