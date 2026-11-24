// Small pure helpers. Dates are local calendar days as 'YYYY-MM-DD' strings.
export const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
export const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 864e5);
export const weekday = (s) => parseYmd(s).getDay(); // 0 = Sunday
export const weekStart = (s) => addDays(s, -((weekday(s) + 6) % 7)); // Monday
export const addMonths = (s, n) => { const d = parseYmd(s); d.setMonth(d.getMonth() + n); return ymd(d); };
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const roundTo = (x, step) => (step > 0 ? Math.round(x / step) * step : x);
export const r1 = (x) => Math.round(x * 10) / 10;
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + (f(x) || 0), 0);
export const avg = (arr) => (arr.length ? sum(arr) / arr.length : null);
export const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.t || 0) - (b.t || 0));
export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9.\s]/g, ' ').replace(/\s+/g, ' ').trim();
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const fmtShort = (s) => { const d = parseYmd(s); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
export const fmtLong = (s) => { const d = parseYmd(s); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; };
export const fmtMonthYear = (s) => { const d = parseYmd(s); return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
export const dayName = (wd) => DAYS[wd];

// Least-squares slope (y per day) of points [{date, y}]
export function slopePerDay(points) {
  if (points.length < 2) return null;
  const x0 = points[0].date;
  const xs = points.map((p) => daysBetween(x0, p.date));
  const ys = points.map((p) => p.y);
  const mx = avg(xs), my = avg(ys);
  let num = 0, den = 0;
  xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) ** 2; });
  return den ? num / den : null;
}
