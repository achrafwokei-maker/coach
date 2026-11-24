// Small presentational helpers: icons, charts, rings, bars.
import { esc, fmtShort, daysBetween } from './util.js';

const P = {
  gear: '<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  check: '<path d="M5 12.5 10 17.5 19 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  back: '<path d="m15 6-6 6 6 6"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  eq: '<path d="M6 10h12M6 14h12"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  today: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  book: '<path d="M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z"/>',
  repeat: '<path d="M17 2l3 3-3 3M3 11V9a4 4 0 0 1 4-4h13M7 22l-3-3 3-3M21 13v2a4 4 0 0 1-4 4H4"/>',
};
export const icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;

export function ring(value, max, size = 132, stroke = 11, label = '', sub = '') {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const over = value > max * 1.05;
  return `<div class="ring" style="width:${size}px;height:${size}px">
    <svg viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-bg" stroke-width="${stroke}" fill="none"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-fg ${over ? 'over' : ''}" stroke-width="${stroke}" fill="none" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>
    <div class="ring-label"><b>${label}</b><span>${sub}</span></div></div>`;
}

export function bar(value, max, cls = '') {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return `<div class="bar ${cls}"><i style="width:${pct}%"></i></div>`;
}

// Line chart. points: [{date, y}]. opts: {target, unit, h, band:[lo,hi]}
export function lineChart(points, opts = {}) {
  if (points.length < 2) return `<div class="chart-empty">${esc(opts.empty || 'Two or more entries are needed for a chart.')}</div>`;
  const W = 340, H = opts.h || 150, padL = 34, padR = 10, padT = 12, padB = 22;
  const x0 = points[0].date, span = Math.max(1, daysBetween(x0, points[points.length - 1].date));
  let ys = points.map((p) => p.y);
  if (opts.target != null) ys = ys.concat(opts.target);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (hi - lo < 1) { lo -= 0.5; hi += 0.5; }
  const padY = (hi - lo) * 0.12; lo -= padY; hi += padY;
  const X = (d) => padL + (daysBetween(x0, d) / span) * (W - padL - padR);
  const Y = (y) => padT + (1 - (y - lo) / (hi - lo)) * (H - padT - padB);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${X(p.date).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
  const area = `${path}L${X(points[points.length - 1].date).toFixed(1)},${H - padB}L${X(x0).toFixed(1)},${H - padB}Z`;
  const ticks = [lo + padY, (lo + hi) / 2, hi - padY].map((v) => `<text x="${padL - 6}" y="${Y(v) + 3}" text-anchor="end">${Math.round(v * 10) / 10}</text><line x1="${padL}" x2="${W - padR}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/>`).join('');
  const target = opts.target != null ? `<line x1="${padL}" x2="${W - padR}" y1="${Y(opts.target)}" y2="${Y(opts.target)}" class="target"/><text x="${W - padR}" y="${Y(opts.target) - 4}" text-anchor="end" class="tlabel">${opts.target}${opts.unit || ''}</text>` : '';
  const last = points[points.length - 1];
  const gid = 'g' + Math.random().toString(36).slice(2, 7);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">
    <defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" class="stop1"/><stop offset="1" class="stop2"/></linearGradient></defs>
    ${ticks}${target}<path d="${area}" fill="url(#${gid})"/><path d="${path}" class="line"/>
    ${points.length <= 40 ? points.map((p) => `<circle cx="${X(p.date)}" cy="${Y(p.y)}" r="2.2" class="dot"/>`).join('') : ''}
    <circle cx="${X(last.date)}" cy="${Y(last.y)}" r="4" class="dot last"/>
    <text x="${padL}" y="${H - 6}">${fmtShort(x0)}</text><text x="${W - padR}" y="${H - 6}" text-anchor="end">${fmtShort(last.date)}</text></svg>`;
}

// Simple vertical bars: items [{label, v, max, hit}]
export function barChart(items, target) {
  const max = Math.max(target || 0, ...items.map((i) => i.v)) || 1;
  return `<div class="vbars"><div class="vb-area">${items.map((i) => `<div class="vb ${i.hit ? 'hit' : ''}"><i style="height:${Math.max(i.v ? 3 : 0, (i.v / max) * 100)}%"></i></div>`).join('')}
    ${target ? `<div class="vb-target" style="bottom:${(target / max) * 100}%"></div>` : ''}</div>
    <div class="vb-labels">${items.map((i) => `<span>${esc(i.label)}</span>`).join('')}</div></div>`;
}

export const STATUS = {
  increase: { label: 'Increase', icon: 'up', cls: 'up' },
  maintain: { label: 'Maintain', icon: 'eq', cls: 'eq' },
  decrease: { label: 'Decrease', icon: 'down', cls: 'down' },
  caution: { label: 'Go lighter', icon: 'down', cls: 'down' },
  calibrate: { label: 'Calibrate', icon: 'spark', cls: 'cal' },
};
