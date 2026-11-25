// Pure training / nutrition / goal logic. No DOM, no storage — fully unit-tested in tests/.
import { addDays, daysBetween, weekday, weekStart, roundTo, r1, sum, avg, byDate, norm, slopePerDay, clamp } from './util.js';
import { EQUIP } from './program.js';

/* ───────────────────────── Scheduling ───────────────────────── */

export const finishedWorkouts = (workouts) => workouts.filter((w) => w.finished).sort(byDate);

export function nextRotation(program, workouts) {
  const rot = program.rotation;
  const done = finishedWorkouts(workouts).filter((w) => rot.includes(w.dayId));
  if (!done.length) return rot[0];
  return rot[(rot.indexOf(done[done.length - 1].dayId) + 1) % rot.length];
}

// Decide what today is: 'done' | 'train' | 'rest'. Missed sessions are never skipped in the
// rotation (a missed Pull stays the next Pull), and are caught up on a free day when the week
// still needs them, avoiding back-to-back days when possible.
export function todayPlan(program, workouts, today, startDate = today) {
  const fin = finishedWorkouts(workouts);
  const doneToday = fin.find((w) => w.date === today);
  const next = nextRotation(program, workouts);
  if (doneToday) return { type: 'done', dayId: doneToday.dayId, next, workout: doneToday };
  const days = program.trainingDays || [1, 3, 5];
  const ws = weekStart(today);
  const we = addDays(ws, 6);
  const from = startDate > ws ? startDate : ws;
  let scheduledInWeek = 0;
  for (let d = from; d <= we; d = addDays(d, 1)) if (days.includes(weekday(d))) scheduledInWeek++;
  const target = Math.min(program.perWeek || days.length, Math.max(scheduledInWeek, 0));
  const doneThisWeek = fin.filter((w) => w.date >= ws && w.date < today).length;
  const needed = target - doneThisWeek;
  if (needed <= 0) return { type: 'rest', next, reason: 'week-complete', doneThisWeek, target };
  if (days.includes(weekday(today))) return { type: 'train', dayId: next, reason: 'scheduled', doneThisWeek, target };
  let scheduledLeft = 0; // scheduled days after today this week
  for (let d = addDays(today, 1); d <= we; d = addDays(d, 1)) if (days.includes(weekday(d))) scheduledLeft++;
  const trainedYesterday = fin.some((w) => w.date === addDays(today, -1));
  const daysLeftAfterToday = daysBetween(today, we);
  if (needed > scheduledLeft) {
    // Catch up today unless trained yesterday and there is still room to catch up later.
    if (!trainedYesterday || needed > daysLeftAfterToday) {
      return { type: 'train', dayId: next, reason: 'catch-up', doneThisWeek, target, missed: needed - scheduledLeft };
    }
    return { type: 'rest', next, reason: 'catch-up-tomorrow', doneThisWeek, target };
  }
  return { type: 'rest', next, reason: 'rest-day', doneThisWeek, target };
}

/* ───────────────────────── Progression ───────────────────────── */

export const DIFFICULTY = {
  easy: { label: 'Easy', rir: '4+ reps left', rirNum: 4 },
  good: { label: 'Good', rir: '2–3 reps left', rirNum: 2.5 },
  hard: { label: 'Hard', rir: '1 rep left', rirNum: 1 },
  max: { label: 'Too hard', rir: '0 — failed or form broke', rirNum: 0 },
};

export const e1rm = (w, r) => (w > 0 && r > 0 ? w * (1 + Math.min(r, 20) / 30) : 0); // Epley

// Flatten history of one exercise: [{date, sets:[{w,r}], diff, pain, top, best}]
export function exerciseHistory(workouts, exId) {
  const out = [];
  for (const w of finishedWorkouts(workouts)) {
    const e = (w.exercises || []).find((x) => x.exId === exId && !x.skipped);
    if (!e) continue;
    const sets = (e.sets || []).filter((s) => s.done && s.r > 0).map((s) => ({ w: +s.w || 0, r: +s.r }));
    if (!sets.length) continue;
    const top = Math.max(...sets.map((s) => s.w));
    const best = Math.max(...sets.map((s) => e1rm(s.w, s.r)));
    out.push({ date: w.date, sets, diff: e.diff || null, pain: !!e.pain, top, best, volume: sum(sets, (s) => s.w * s.r) });
  }
  return out;
}

function evaluate(ex, session) {
  const [minSets] = ex.sets;
  const [lo, hi] = ex.reps;
  const working = session.sets.filter((s) => s.w === session.top);
  const reps = working.map((s) => s.r);
  const hitTop = working.length >= minSets && reps.every((r) => r >= hi);
  const below = reps.some((r) => r < lo);
  const extra = avg(reps) - hi;
  return { working, reps, hitTop, below, extra };
}

const dec = (w, inc) => Math.max(inc || 1, roundTo(w * 0.92, inc || 1)); // ~5–10% drop, at least one increment below
const fmtKg = (w) => `${r1(w)} kg`;

// Recommendation for the next session of an exercise.
// Returns {status, weight, reps (target per set), sets, prev, why}
export function recommend(ex, history, today) {
  const inc = ex.inc ?? EQUIP[ex.equip]?.inc ?? 2.5;
  const [lo, hi] = ex.reps;
  const sets = ex.sets[1];
  const target = lo === hi ? `${hi}` : `${lo}–${hi}`;
  const last = history[history.length - 1];
  const prevS = history[history.length - 2];
  const bw = ex.equip === 'bodyweight' || inc === 0;

  if (!last) {
    return {
      status: 'calibrate', weight: null, reps: hi, sets, prev: null,
      why: bw
        ? `First session: do ${ex.sets[0]}–${sets} sets of ${target} with clean form and log your reps.`
        : `Calibration: warm up, then pick a weight you can lift for ${target} clean reps with about 2–3 reps left in the tank. Log what you actually did — no guessing needed.`,
    };
  }
  const ev = evaluate(ex, last);
  const prevReps = last.sets.filter((s) => s.w === last.top).map((s) => s.r);
  const base = { prev: last, sets: Math.max(ex.sets[0], Math.min(sets, last.sets.length || sets)) };

  if (last.pain) {
    return { ...base, status: 'caution', weight: bw ? null : dec(last.top, inc), reps: lo,
      why: 'You flagged pain last time. Go lighter, use a pain-free range of motion or swap the exercise. Never push through pain — if it persists, get it checked by a physio or doctor.' };
  }
  if (today && daysBetween(last.date, today) > 21 && !bw) {
    return { ...base, status: 'decrease', weight: dec(last.top, inc), reps: lo,
      why: `It has been ${daysBetween(last.date, today)} days since you last did this. Restart about 8% lighter and build back up over 1–2 sessions.` };
  }
  if (bw) {
    const next = ev.hitTop ? hi : Math.min(hi, Math.max(...prevReps) + 1);
    return { ...base, status: 'maintain', weight: null, reps: next,
      why: ev.hitTop ? `You hit ${hi} reps — add a harder variation or a slow tempo when it feels easy.` : `Aim for ${next} reps per set.` };
  }

  const prevEv = prevS && prevS.top === last.top ? evaluate(ex, prevS) : null;

  if (ev.hitTop) {
    if (last.diff === 'easy') {
      const steps = ev.extra >= 3 ? 2 : 1;
      return { ...base, status: 'increase', weight: last.top + steps * inc, reps: lo,
        why: `All sets reached ${hi}+ reps and felt easy (4+ reps in reserve). Add ${r1(steps * inc)} kg — aim for ${target} reps.` };
    }
    if (last.diff === 'good' || !last.diff) {
      return { ...base, status: 'increase', weight: last.top + inc, reps: lo,
        why: `You completed every set at the top of the range (${hi} reps) with reps in reserve. Add the smallest step: +${r1(inc)} kg, aim for ${target} reps.` };
    }
    if (last.diff === 'hard' && prevEv?.hitTop) {
      return { ...base, status: 'increase', weight: last.top + inc, reps: lo,
        why: `Two sessions in a row at ${hi} reps with ${fmtKg(last.top)}. Time for +${r1(inc)} kg (ACSM two-for-two rule).` };
    }
    return { ...base, status: 'maintain', weight: last.top, reps: hi,
      why: `You reached ${hi} reps but it was ${last.diff === 'max' ? 'at your limit' : 'hard'}. Keep ${fmtKg(last.top)} until it feels "Good", then we add weight.` };
  }

  if (ev.below || last.diff === 'max') {
    const repeated = prevEv && (prevEv.below || prevS.diff === 'max');
    if (repeated) {
      return { ...base, status: 'decrease', weight: dec(last.top, inc), reps: lo,
        why: `Performance fell short twice at ${fmtKg(last.top)}. Drop to ${fmtKg(dec(last.top, inc))}, rebuild reps with good form, then climb again. Check sleep and food too.` };
    }
    return { ...base, status: 'maintain', weight: last.top, reps: lo,
      why: `Last time was below ${lo} reps or at failure. Repeat ${fmtKg(last.top)} and aim for at least ${lo} clean reps. If it happens again, we'll lighten it.` };
  }

  const aim = Math.min(hi, Math.max(...ev.reps) + 1);
  return { ...base, status: 'maintain', weight: last.top, reps: aim,
    why: `Stay at ${fmtKg(last.top)} and add reps: aim for ${aim} per set. Once every set hits ${hi} with reps to spare, the weight goes up.` };
}

// Personal records for an exercise
export function personalRecords(history) {
  if (!history.length) return null;
  let bestE = history[0], heaviest = history[0], vol = history[0];
  for (const h of history) {
    if (h.best > bestE.best) bestE = h;
    if (h.top > heaviest.top) heaviest = h;
    if (h.volume > vol.volume) vol = h;
  }
  return { e1rm: { value: r1(bestE.best), date: bestE.date }, heaviest: { value: heaviest.top, date: heaviest.date }, volume: { value: Math.round(vol.volume), date: vol.date } };
}

// PRs set in a given workout (compared to everything before it)
export function prsInWorkout(workouts, workout) {
  const before = finishedWorkouts(workouts).filter((w) => w.date < workout.date || (w.date === workout.date && w.id !== workout.id && (w.t || 0) < (workout.t || 0)));
  const prs = [];
  for (const e of workout.exercises || []) {
    const sets = (e.sets || []).filter((s) => s.done && s.r > 0 && s.w > 0);
    if (!sets.length) continue;
    const hist = exerciseHistory(before, e.exId);
    if (!hist.length) continue;
    const prevBest = Math.max(...hist.map((h) => h.best));
    const prevTop = Math.max(...hist.map((h) => h.top));
    const best = Math.max(...sets.map((s) => e1rm(+s.w, +s.r)));
    const top = Math.max(...sets.map((s) => +s.w));
    if (top > prevTop) prs.push({ exId: e.exId, name: e.name, kind: 'weight', value: top });
    else if (best > prevBest + 0.01) prs.push({ exId: e.exId, name: e.name, kind: 'e1rm', value: r1(best) });
  }
  return prs;
}

// Weighted hard sets per muscle in [from, to]: first listed muscle counts 1, others 0.5.
export function weeklyVolume(workouts, exMap, from, to) {
  const vol = {};
  for (const w of finishedWorkouts(workouts)) {
    if (w.date < from || w.date > to) continue;
    for (const e of w.exercises || []) {
      const n = (e.sets || []).filter((s) => s.done && s.r > 0).length;
      const muscles = exMap[e.exId]?.muscles || [];
      muscles.forEach((m, i) => { vol[m] = (vol[m] || 0) + n * (i === 0 ? 1 : 0.5); });
    }
  }
  return vol;
}

// Compare strength over a window: e1RM first vs last session per exercise.
export function strengthTrend(workouts, exMap, today, windowDays = 42) {
  const from = addDays(today, -windowDays);
  const rows = [];
  for (const id of Object.keys(exMap)) {
    if (exMap[id].equip === 'bodyweight') continue;
    const h = exerciseHistory(workouts, id).filter((x) => x.date >= from);
    if (h.length < 2) continue;
    const a = h[0].best, b = h[h.length - 1].best;
    rows.push({ id, name: exMap[id].name, change: a ? (b - a) / a : 0, sessions: h.length });
  }
  const up = rows.filter((r) => r.change > 0.005).length;
  const down = rows.filter((r) => r.change < -0.02).length;
  return { rows, up, down, flat: rows.length - up - down, avgChange: rows.length ? avg(rows.map((r) => r.change)) : null };
}

// Sessions that went worse than the previous one for many exercises → recovery signal.
export function performanceDip(workouts, n = 2) {
  const fin = finishedWorkouts(workouts).slice(-n);
  let worse = 0, total = 0;
  for (const w of fin) {
    for (const e of w.exercises || []) {
      const hist = exerciseHistory(finishedWorkouts(workouts).filter((x) => x.date <= w.date), e.exId);
      if (hist.length < 2) continue;
      const [p, c] = hist.slice(-2);
      total++;
      if (c.best < p.best * 0.97 || c.diff === 'max') worse++;
    }
  }
  return { worse, total, flagged: total >= 4 && worse / total >= 0.5 };
}

/* ───────────────────────── Nutrition ───────────────────────── */

export function itemFrom(food, grams) {
  const m = grams / 100;
  return { fid: food.id, n: food.n, g: Math.round(grams), k: Math.round(food.k * m), p: r1(food.p * m), c: r1(food.c * m), f: r1(food.f * m) };
}

export function totals(entries) {
  const items = entries.flatMap((e) => e.items || []);
  return { k: Math.round(sum(items, (i) => i.k)), p: r1(sum(items, (i) => i.p)), c: r1(sum(items, (i) => i.c)), f: r1(sum(items, (i) => i.f)) };
}

export function remaining(targets, t) {
  return { k: targets.kcal - t.k, p: r1(targets.protein - t.p), c: r1(targets.carbs - t.c), f: r1(targets.fat - t.f) };
}

// Daily totals for each logged day in [from, to]
export function dailyTotals(food, from, to) {
  const byDay = {};
  for (const e of food) if (e.date >= from && e.date <= to) (byDay[e.date] ||= []).push(e);
  return Object.entries(byDay).map(([date, es]) => ({ date, ...totals(es) })).sort(byDate);
}

export function nutritionSummary(food, targets, from, to) {
  const days = dailyTotals(food, from, to).filter((d) => d.k > 600); // ignore clearly incomplete days
  const span = daysBetween(from, to) + 1;
  if (!days.length) return { logged: 0, span, avg: null };
  const a = { k: Math.round(avg(days.map((d) => d.k))), p: r1(avg(days.map((d) => d.p))), c: r1(avg(days.map((d) => d.c))), f: r1(avg(days.map((d) => d.f))) };
  const proteinHit = days.filter((d) => d.p >= targets.protein * 0.9).length;
  const kcalHit = days.filter((d) => Math.abs(d.k - targets.kcal) <= targets.kcal * 0.1).length;
  return { logged: days.length, span, avg: a, proteinHit, kcalHit };
}

const NUMS = { one: 1, a: 1, an: 1, un: 1, une: 1, two: 2, deux: 2, three: 3, trois: 3, four: 4, quatre: 4, five: 5, cinq: 5, six: 6, half: 0.5, demi: 0.5, moitie: 0.5 };
const UNIT_G = { g: 1, gr: 1, gram: 1, grams: 1, gramme: 1, grammes: 1, kg: 1000, ml: 1, cl: 10, l: 1000, litre: 1000, liter: 1000 };

// Parse a written / dictated description like "3 eggs, 150g chicken and a plate of rice".
// Returns {items:[{food, grams, text}], unknown:[text]} — always confirmed by the user before saving.
export function parseFoodText(text, foods) {
  const chunks = String(text || '').split(/\s*(?:,|;|\+|&|\n|\band\b|\bet\b|\bwith\b|\bavec\b|\bplus\b)\s*/i).map((s) => norm(s)).filter(Boolean);
  const index = foods.flatMap((f) => [f.n, ...(f.a || [])].map((a) => ({ f, a: norm(a) }))).filter((x) => x.a);
  const items = [], unknown = [];
  for (const chunk of chunks) {
    let best = null;
    for (const x of index) {
      const re = new RegExp(`(^|\\s)${x.a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?(\\s|$)`);
      if (re.test(chunk) && (!best || x.a.length > best.a.length)) best = x;
    }
    if (!best) { if (chunk.length > 1) unknown.push(chunk); continue; }
    let food = best.f;
    if (food.pair) {
      const wantsRaw = /\b(raw|cru|crue|crus|dry|sec)\b/.test(chunk);
      const pair = foods.find((f) => f.id === food.pair);
      if (pair && !!pair.raw === wantsRaw && !!food.raw !== wantsRaw) food = pair;
    }
    let grams = null;
    const mUnit = chunk.match(/(\d+(?:\.\d+)?)\s*(kg|g|gr|grams?|grammes?|ml|cl|l|litre|liter)\b/);
    if (mUnit) grams = parseFloat(mUnit[1]) * UNIT_G[mUnit[2]];
    if (grams == null) {
      const mNum = chunk.match(/(\d+(?:\.\d+)?)/);
      const word = chunk.split(' ').find((w) => NUMS[w] != null);
      const count = mNum ? parseFloat(mNum[1]) : word ? NUMS[word] : 1;
      if (mNum && count >= 20) grams = count;
      else {
        const unit = (food.u || []).find(([label]) => chunk.includes(norm(label))) || (food.u || [])[0];
        grams = count * (unit ? unit[1] : 100);
      }
    }
    items.push({ food, grams: Math.round(grams), text: chunk });
  }
  return { items, unknown };
}

// Suggest practical meals that fit what is left today.
export function suggestMeals(rem, templates, foods, hour = 12, n = 3) {
  if (rem.k < 120 && rem.p < 10) return [];
  const byId = Object.fromEntries(foods.map((f) => [f.id, f]));
  const mealsLeft = hour < 11 ? 3 : hour < 16 ? 2 : hour < 20 ? 1.5 : 1;
  const goal = { k: Math.max(rem.k, 0) / mealsLeft, p: Math.max(rem.p, 0) / mealsLeft };
  const out = [];
  for (const t of templates) {
    let bestScale = null;
    for (const s of [0.5, 0.75, 1, 1.25, 1.5]) {
      const items = t.items.filter(([id]) => byId[id]).map(([id, g]) => itemFrom(byId[id], g * s));
      const tot = totals([{ items }]);
      if (tot.k > rem.k + 120 || tot.f > Math.max(rem.f, 0) + 12) continue;
      const score = Math.abs(tot.k - goal.k) / 300 + Math.abs(tot.p - goal.p) / 15 + (rem.p > 20 && tot.p / Math.max(tot.k, 1) < 0.06 ? 1 : 0);
      if (!bestScale || score < bestScale.score) bestScale = { name: t.n, items, tot, score, scale: s };
    }
    if (bestScale) out.push(bestScale);
  }
  return out.sort((a, b) => a.score - b.score).slice(0, n);
}

/* ───────────────────────── Body & goals ───────────────────────── */

export const weights = (body) => body.filter((b) => b.weight > 0).sort(byDate);

// Smoothed current weight: mean of weigh-ins in the last 7 days of data.
export function currentWeight(body, fallback) {
  const w = weights(body);
  if (!w.length) return fallback ?? null;
  const last = w[w.length - 1].date;
  return r1(avg(w.filter((x) => daysBetween(x.date, last) <= 6).map((x) => x.weight)));
}

// Rate of change in kg/week from a linear fit over the last `days` (needs ≥3 weigh-ins over ≥10 days).
export function weightRate(body, today, days = 28) {
  const w = weights(body).filter((x) => daysBetween(x.date, today) <= days);
  if (w.length < 3 || daysBetween(w[0].date, w[w.length - 1].date) < 10) return null;
  const s = slopePerDay(w.map((x) => ({ date: x.date, y: x.weight })));
  return s == null ? null : s * 7;
}

export function milestones(start, target, current, rate, today) {
  const list = [];
  const step = target > start ? 1 : -1;
  for (let m = Math.floor(start) + step; step > 0 ? m <= target : m >= target; m += step) {
    const reached = step > 0 ? current >= m : current <= m;
    let eta = null;
    if (!reached && rate && Math.sign(rate) === step) eta = addDays(today, Math.ceil(((m - current) / rate) * 7));
    const progress = clamp((current - start) / (m - start), 0, 1);
    list.push({ kg: m, reached, eta, progress });
  }
  return list;
}

export function goalStatus(profile, body, today) {
  const start = profile.startWeight;
  const target = profile.targetWeight;
  const current = currentWeight(body, start);
  const rate = weightRate(body, today);
  const progress = clamp((current - start) / (target - start), 0, 1);
  const eta = rate && rate > 0.02 && current < target ? addDays(today, Math.ceil(((target - current) / rate) * 7)) : current >= target ? today : null;
  return { start, target, current, rate, progress, eta, milestones: milestones(start, target, current, rate, today) };
}

// Lean-gain band (kg/week). ~0.15–0.4 % of body weight per week, slower end for staying lean.
export const GAIN_BAND = { lo: 0.1, hi: 0.3, fast: 0.4 };

// Conservative calorie-adjustment logic. Needs ≥14 days of weigh-ins and consistent logging.
export function calorieAdvice({ body, food, targets, today, startDate, lastAdjust }) {
  const from = addDays(today, -13);
  const w = weights(body).filter((x) => x.date >= addDays(today, -27));
  const span = w.length ? daysBetween(w[0].date, w[w.length - 1].date) : 0;
  const nut = nutritionSummary(food, targets, from, addDays(today, -1));
  const reasons = [];
  if (w.length < 3 || span < 14) reasons.push(`need weigh-ins spanning at least 14 days (have ${w.length} over ${span} days)`);
  if (nut.logged < 10) reasons.push(`need food logged on at least 10 of the last 14 days (have ${nut.logged})`);
  if (lastAdjust && daysBetween(lastAdjust, today) < 14) reasons.push('the last change was less than 2 weeks ago — give it time');
  const rate = weightRate(body, today);
  if (reasons.length || rate == null) return { change: 0, status: 'insufficient', rate, nut, reasons };
  const adherent = nut.avg && Math.abs(nut.avg.k - targets.kcal) <= targets.kcal * 0.1;
  const weeksIn = startDate ? daysBetween(startDate, today) / 7 : 99;
  if (rate < GAIN_BAND.lo) {
    if (!adherent) return { change: 0, status: 'adherence', rate, nut, reasons: [`your average intake (${nut.avg.k} kcal) is not close to the target yet — hit ${targets.kcal} kcal consistently first`] };
    return { change: rate <= 0 ? 150 : 100, status: 'slow', rate, nut, reasons: [] };
  }
  if (rate > GAIN_BAND.fast || (rate > GAIN_BAND.hi && weeksIn > 4)) {
    if (weeksIn <= 3) return { change: 0, status: 'early', rate, nut, reasons: ['early weight jumps are mostly water and glycogen (creatine and more carbs add 1–2 kg of water) — wait another week'] };
    return { change: rate > GAIN_BAND.fast + 0.15 ? -150 : -100, status: 'fast', rate, nut, reasons: [] };
  }
  return { change: 0, status: 'on-track', rate, nut, reasons: [] };
}

// Apply a kcal change: split mostly into carbs, some fat; protein stays.
export function applyCalorieChange(t, change) {
  const carbs = Math.round((change * 0.7) / 4);
  const fat = Math.round((change * 0.3) / 9);
  return { ...t, kcal: t.kcal + change, carbs: t.carbs + carbs, fat: t.fat + fat };
}

export const macroKcal = (t) => Math.round(t.protein * 4 + t.carbs * 4 + t.fat * 9);

// Plain answer to "did I reach my nutrition goal today?"
// Calories count as reached within ±10% of target; protein from 90% of target.
export function nutritionVerdict(t, T, hasFood) {
  const kLow = t.k < T.kcal * 0.9, kHigh = t.k > T.kcal * 1.1, pOk = t.p >= T.protein * 0.9;
  if (!hasFood) return { status: 'empty', title: 'Nothing logged yet', text: `Today’s goal: ${T.kcal} kcal and ${T.protein} g protein.` };
  if (!kLow && !kHigh && pOk) return { status: 'done', title: 'Goal reached', text: 'Calories and protein are on target today.' };
  if (kHigh) return { status: 'over', title: `${Math.round(t.k - T.kcal)} kcal over`, text: pOk ? 'Protein reached. Slightly over on calories — fine once in a while.' : `Over on calories but still ${Math.round(T.protein - t.p)} g protein short.` };
  const need = [];
  if (kLow) need.push(`${Math.round(T.kcal - t.k)} kcal`);
  if (!pOk) need.push(`${Math.round(T.protein - t.p)} g protein`);
  return { status: 'todo', title: 'Not reached yet', text: `Still ${need.join(' and ')} to go.` };
}

// Per-macro status for the checklist: 'ok' (90–115%), 'low', 'high'.
export function macroStatus(val, target) {
  if (!target) return 'ok';
  const r = val / target;
  return r < 0.9 ? 'low' : r > 1.15 ? 'high' : 'ok';
}
