// Uptime check: fetch the page (following redirects) and verify the response.
import { request, friendlyError } from '../lib/safehttp.js';

export async function httpCheck(url, { timeoutMs = 15000, keyword = '', allowPrivate = false, userAgent } = {}) {
  const started = performance.now();
  try {
    const res = await request(url, {
      timeoutMs,
      allowPrivate,
      userAgent,
      readBody: Boolean(keyword),
      headers: { accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8' },
    });
    const ms = Math.round(performance.now() - started);
    if (res.status >= 400) return { ok: false, ms, code: res.status, error: `HTTP ${res.status}` };
    if (res.status >= 300) return { ok: false, ms, code: res.status, error: `Unfollowed redirect (HTTP ${res.status})` };
    if (keyword && !res.body.toLowerCase().includes(keyword.toLowerCase())) {
      return { ok: false, ms, code: res.status, error: `Keyword "${keyword}" not found on page` };
    }
    return { ok: true, ms, code: res.status, error: null };
  } catch (err) {
    return { ok: false, ms: Math.round(performance.now() - started), code: null, error: friendlyError(err) };
  }
}
