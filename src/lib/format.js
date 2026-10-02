// Formatting helpers shared by pages and emails. All dates are shown in UTC.
export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const dateFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const monthFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' });

export const formatDate = (ms) => (ms ? dateFmt.format(new Date(ms)) : '—');
export const formatDateTime = (ms) => (ms ? `${dateTimeFmt.format(new Date(ms))} UTC` : '—');
export const formatMonth = (ms) => monthFmt.format(new Date(ms));

export const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);
export const utcMonth = (ms) => new Date(ms).toISOString().slice(0, 7);

export function startOfUtcMonth(ms) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

export function previousMonthRange(ms) {
  const end = startOfUtcMonth(ms);
  const start = startOfUtcMonth(end - 1);
  return { start, end };
}

export function formatDuration(ms) {
  if (ms == null || ms < 0) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}

export function timeAgo(ms, now = Date.now()) {
  if (!ms) return 'never';
  const diff = now - ms;
  if (diff < 45_000) return 'just now';
  return `${formatDuration(diff)} ago`;
}

export const daysUntil = (ms, now = Date.now()) => (ms ? Math.floor((ms - now) / DAY) : null);

export function formatPercent(value, digits = 2) {
  if (value == null || Number.isNaN(value)) return '—';
  if (value >= 100) return '100%';
  return `${value.toFixed(digits)}%`;
}

export const formatMs = (ms) => (ms == null ? '—' : `${Math.round(ms).toLocaleString('en-US')} ms`);

export const formatMoney = (amount) =>
  `$${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export function hostnameOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
