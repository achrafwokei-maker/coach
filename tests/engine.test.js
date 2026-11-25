import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { addDays, weekStart, ymd } from '../js/util.js';
import { DEFAULT_PROGRAM, cloneProgram, allExercises } from '../js/program.js';
import { FOODS, MEAL_TEMPLATES } from '../js/foods.js';
import {
  nextRotation, todayPlan, exerciseHistory, recommend, personalRecords, prsInWorkout, weeklyVolume,
  itemFrom, totals, remaining, parseFoodText, suggestMeals, nutritionSummary, goalStatus, weightRate,
  calorieAdvice, applyCalorieChange, macroKcal, currentWeight, performanceDip, e1rm,
} from '../js/engine.js';
import { buildContext, coachAnswers, dailyMessage, weeklyReport } from '../js/coach.js';
import { validate } from '../js/backup.js';

const MON = '2026-11-23'; // a Monday
const P = cloneProgram();
const ex = (id) => allExercises(P)[id];
const W = (date, dayId, exercises = []) => ({ id: date + dayId, date, dayId, t: Date.parse(date), finished: true, exercises });
const E = (exId, sets, diff = 'good', extra = {}) => ({ exId, name: exId, sets: sets.map(([w, r]) => ({ w, r, done: true })), diff, ...extra });

/* ── Scheduling ── */
test('rotation starts with Push and follows Push → Pull → Legs', () => {
  assert.equal(nextRotation(P, []), 'push');
  assert.equal(nextRotation(P, [W(MON, 'push')]), 'pull');
  assert.equal(nextRotation(P, [W(MON, 'push'), W(addDays(MON, 2), 'pull')]), 'legs');
  assert.equal(nextRotation(P, [W(MON, 'push'), W(addDays(MON, 2), 'pull'), W(addDays(MON, 4), 'legs')]), 'push');
});

test('scheduled day shows the next workout; non-scheduled day is rest', () => {
  assert.deepEqual([todayPlan(P, [], MON, MON).type, todayPlan(P, [], MON, MON).dayId], ['train', 'push']);
  const tue = todayPlan(P, [W(MON, 'push')], addDays(MON, 1), MON);
  assert.equal(tue.type, 'rest');
  assert.equal(tue.next, 'pull');
});

test('a finished workout today shows as done', () => {
  const p = todayPlan(P, [W(MON, 'push')], MON, MON);
  assert.equal(p.type, 'done');
  assert.equal(p.next, 'pull');
});

test('missed workout is caught up on the next free day, never skipped', () => {
  // Missed Monday entirely → Tuesday becomes a catch-up Push.
  const tue = todayPlan(P, [], addDays(MON, 1), MON);
  assert.equal(tue.type, 'train');
  assert.equal(tue.reason, 'catch-up');
  assert.equal(tue.dayId, 'push');
  // Trained Tuesday (catch-up), Wed scheduled → Pull.
  const wed = todayPlan(P, [W(addDays(MON, 1), 'push')], addDays(MON, 2), MON);
  assert.deepEqual([wed.type, wed.dayId], ['train', 'pull']);
});

test('weekly target met → rest even on a scheduled day', () => {
  const ws = [W(MON, 'push'), W(addDays(MON, 1), 'pull'), W(addDays(MON, 2), 'legs')];
  const fri = todayPlan(P, ws, addDays(MON, 4), MON);
  assert.equal(fri.type, 'rest');
  assert.equal(fri.reason, 'week-complete');
});

test('starting mid-week only expects the remaining scheduled days', () => {
  const thu = addDays(MON, 3);
  // Start Thursday: only Friday is scheduled → Thursday rest, Friday train.
  assert.equal(todayPlan(P, [], thu, thu).type, 'rest');
  assert.equal(todayPlan(P, [], addDays(MON, 4), thu).type, 'train');
});

/* ── Progressive overload ── */
const bench = ex('bench');            // 2–3 × 12, barbell +2.5
const fly = ex('db_fly');              // 2–3 × 12–15, dumbbell +2

test('calibration: no history → no invented weight', () => {
  const r = recommend(bench, [], MON);
  assert.equal(r.status, 'calibrate');
  assert.equal(r.weight, null);
});

test('top of range with reps in reserve → smallest increment', () => {
  const h = exerciseHistory([W(MON, 'push', [E('bench', [[60, 12], [60, 12], [60, 12]], 'good')])], 'bench');
  const r = recommend(bench, h, addDays(MON, 7));
  assert.equal(r.status, 'increase');
  assert.equal(r.weight, 62.5);
});

test('dumbbell increments use dumbbell step', () => {
  const h = exerciseHistory([W(MON, 'push', [E('db_fly', [[14, 15], [14, 15]], 'good')])], 'db_fly');
  assert.equal(recommend(fly, h, MON).weight, 16);
});

test('easy with many extra reps → two increments', () => {
  const h = exerciseHistory([W(MON, 'push', [E('bench', [[60, 16], [60, 15], [60, 15]], 'easy')])], 'bench');
  assert.equal(recommend(bench, h, MON).weight, 65);
});

test('within range but not at top → maintain and add reps', () => {
  const h = exerciseHistory([W(MON, 'push', [E('db_fly', [[14, 13], [14, 12]], 'good')])], 'db_fly');
  const r = recommend(fly, h, MON);
  assert.equal(r.status, 'maintain');
  assert.equal(r.weight, 14);
  assert.equal(r.reps, 14);
});

test('top of range but hard → maintain; twice in a row → increase', () => {
  const one = exerciseHistory([W(MON, 'push', [E('bench', [[60, 12], [60, 12]], 'hard')])], 'bench');
  assert.equal(recommend(bench, one, MON).status, 'maintain');
  const two = exerciseHistory([
    W(MON, 'push', [E('bench', [[60, 12], [60, 12]], 'hard')]),
    W(addDays(MON, 7), 'push', [E('bench', [[60, 12], [60, 12]], 'hard')]),
  ], 'bench');
  assert.equal(recommend(bench, two, addDays(MON, 8)).status, 'increase');
});

test('one bad session → maintain; repeated decline → decrease', () => {
  const one = exerciseHistory([W(MON, 'push', [E('bench', [[60, 9], [60, 8]], 'max')])], 'bench');
  assert.equal(recommend(bench, one, MON).status, 'maintain');
  const two = exerciseHistory([
    W(MON, 'push', [E('bench', [[60, 9], [60, 8]], 'max')]),
    W(addDays(MON, 7), 'push', [E('bench', [[60, 8], [60, 7]], 'max')]),
  ], 'bench');
  const r = recommend(bench, two, addDays(MON, 8));
  assert.equal(r.status, 'decrease');
  assert.ok(r.weight < 60 && r.weight >= 52.5);
  assert.equal(r.weight % 2.5, 0);
});

test('never increases just because time passed', () => {
  const h = exerciseHistory([W(MON, 'push', [E('db_fly', [[14, 12], [14, 12]], 'good')])], 'db_fly');
  assert.notEqual(recommend(fly, h, addDays(MON, 14)).status, 'increase');
});

test('pain flag → go lighter, no progression', () => {
  const h = exerciseHistory([W(MON, 'push', [E('bench', [[60, 12], [60, 12]], 'good', { pain: true })])], 'bench');
  const r = recommend(bench, h, MON);
  assert.equal(r.status, 'caution');
  assert.ok(r.weight < 60);
});

test('long break → restart lighter', () => {
  const h = exerciseHistory([W(MON, 'push', [E('bench', [[60, 12], [60, 12]], 'good')])], 'bench');
  assert.equal(recommend(bench, h, addDays(MON, 30)).status, 'decrease');
});

test('only completed sets count; skipped exercises ignored', () => {
  const w = W(MON, 'push', [{ exId: 'bench', sets: [{ w: 100, r: 12, done: false }, { w: 60, r: 12, done: true }], diff: 'good' }, { exId: 'db_fly', skipped: true, sets: [{ w: 10, r: 10, done: true }] }]);
  const h = exerciseHistory([w], 'bench');
  assert.equal(h[0].top, 60);
  assert.equal(exerciseHistory([w], 'db_fly').length, 0);
});

test('personal records and PR detection', () => {
  const w1 = W(MON, 'push', [E('bench', [[60, 12], [60, 12]])]);
  const w2 = W(addDays(MON, 7), 'push', [E('bench', [[62.5, 12], [62.5, 11]])]);
  const pr = personalRecords(exerciseHistory([w1, w2], 'bench'));
  assert.equal(pr.heaviest.value, 62.5);
  assert.equal(prsInWorkout([w1, w2], w2).length, 1);
  assert.equal(prsInWorkout([w1], w1).length, 0); // first session is a baseline, not a PR
  assert.ok(Math.abs(e1rm(60, 12) - 84) < 0.01);
});

test('weekly volume counts sets per muscle', () => {
  const v = weeklyVolume([W(MON, 'push', [E('bench', [[60, 12], [60, 12], [60, 12]])])], allExercises(P), MON, addDays(MON, 6));
  assert.equal(v.chest, 3);
  assert.equal(v.triceps, 1.5);
});

test('performance dip is flagged when most exercises regress', () => {
  const mk = (d, w) => W(d, 'push', ['bench', 'incline_smith', 'db_fly', 'oh_tri'].map((id) => E(id, [[w, 12], [w, 12]])));
  const ws = [mk(MON, 50), mk(addDays(MON, 7), 40)];
  assert.equal(performanceDip(ws).flagged, true);
});

/* ── Nutrition ── */
const food = (id) => FOODS.find((f) => f.id === id);

test('food database is complete and sane', () => {
  const ids = new Set();
  for (const f of FOODS) {
    assert.ok(!ids.has(f.id), `duplicate ${f.id}`); ids.add(f.id);
    for (const k of ['k', 'p', 'c', 'f']) assert.ok(f[k] >= 0, `${f.id}.${k}`);
    const calc = f.p * 4 + f.c * 4 + f.f * 9;
    assert.ok(Math.abs(calc - f.k) <= Math.max(25, f.k * 0.2), `${f.id}: ${f.k} kcal vs macros ${calc}`);
    if (f.pair) assert.ok(FOODS.find((x) => x.id === f.pair), `${f.id} pair`);
  }
  for (const id of ['egg', 'chicken_cooked', 'rice_cooked', 'pasta_cooked', 'baguette', 'potato_boiled', 'tuna_water', 'lentils_cooked', 'chorba', 'couscous_dish', 'rechta', 'chakhchoukha', 'kesra', 'dates', 'lben']) assert.ok(food(id), id);
  for (const t of MEAL_TEMPLATES) for (const [id] of t.items) assert.ok(food(id), `template ${t.n}: ${id}`);
});

test('item macros scale by grams', () => {
  const i = itemFrom(food('chicken_cooked'), 200);
  assert.deepEqual([i.k, i.p, i.f], [330, 62, 7.2]);
});

test('daily totals and remaining', () => {
  const t = totals([{ items: [itemFrom(food('egg'), 150)] }, { items: [itemFrom(food('rice_cooked'), 200)] }]);
  assert.equal(t.k, 215 + 260);
  const rem = remaining({ kcal: 2440, protein: 160, carbs: 270, fat: 80 }, t);
  assert.equal(rem.k, 2440 - 475);
  assert.ok(rem.p > 135 && rem.p < 137);
});

test('parses written/dictated food descriptions', () => {
  const r = parseFoodText('3 eggs, 200g rice and a bowl of chorba', FOODS);
  assert.deepEqual(r.items.map((i) => [i.food.id, i.grams]), [['egg', 150], ['rice_cooked', 200], ['chorba', 350]]);
  const fr = parseFoodText('deux oeufs et 150 g de poulet', FOODS);
  assert.deepEqual(fr.items.map((i) => [i.food.id, i.grams]), [['egg', 100], ['chicken_cooked', 150]]);
  const raw = parseFoodText('80g raw pasta', FOODS);
  assert.equal(raw.items[0].food.id, 'pasta_raw');
  const un = parseFoodText('zzqx', FOODS);
  assert.equal(un.items.length, 0);
  assert.equal(un.unknown.length, 1);
  assert.equal(parseFoodText('5 dates + lben', FOODS).items[0].grams, 40);
});

test('meal suggestions fit remaining needs', () => {
  const s = suggestMeals({ k: 700, p: 50, c: 80, f: 20 }, MEAL_TEMPLATES, FOODS, 13, 3);
  assert.ok(s.length >= 1);
  for (const m of s) assert.ok(m.tot.k <= 700 + 120);
  assert.equal(suggestMeals({ k: 50, p: 2, c: 0, f: 0 }, MEAL_TEMPLATES, FOODS, 21).length, 0);
});

test('starting macros add up to 2440 kcal', () => {
  assert.equal(macroKcal({ protein: 160, carbs: 270, fat: 80 }), 2440);
});

/* ── Goals & coaching ── */
const profile = { name: 'Test', startWeight: 74, targetWeight: 79, planMonths: 8, creatine: 5 };
const targets = { kcal: 2440, protein: 160, carbs: 270, fat: 80 };
const series = (start, days, perWeek, every = 3) => Array.from({ length: Math.floor(days / every) + 1 }, (_, i) => ({ id: 'b' + i, date: addDays(start, i * every), weight: +(74 + (perWeek / 7) * i * every).toFixed(2) }));
const foodDays = (start, n, kcal) => Array.from({ length: n }, (_, i) => ({ id: 'f' + i, date: addDays(start, i), items: [{ k: kcal, p: 160, c: 270, f: 80 }] }));

test('goal status, milestones and ETA', () => {
  const body = series(MON, 28, 0.3);
  const today = addDays(MON, 28);
  const g = goalStatus(profile, body, today);
  assert.ok(Math.abs(g.rate - 0.3) < 0.02, `rate ${g.rate}`);
  assert.deepEqual(g.milestones.map((m) => m.kg), [75, 76, 77, 78, 79]);
  assert.equal(g.milestones[0].reached, true);
  assert.ok(g.eta > today);
  assert.equal(currentWeight([], 74), 74);
  assert.equal(weightRate([{ date: MON, weight: 74 }], MON), null);
});

test('calorie advice refuses to act without 2 weeks of data', () => {
  const a = calorieAdvice({ body: series(MON, 6, 0), food: foodDays(MON, 7, 2440), targets, today: addDays(MON, 7), startDate: MON });
  assert.equal(a.status, 'insufficient');
  assert.equal(a.change, 0);
});

test('stalled weight with good adherence → +100–150 kcal', () => {
  const today = addDays(MON, 21);
  const a = calorieAdvice({ body: series(MON, 21, 0), food: foodDays(addDays(MON, 7), 14, 2440), targets, today, startDate: MON });
  assert.equal(a.status, 'slow');
  assert.ok(a.change >= 100 && a.change <= 150);
});

test('stalled weight but not eating the target → no change, eat the target first', () => {
  const today = addDays(MON, 21);
  const a = calorieAdvice({ body: series(MON, 21, 0), food: foodDays(addDays(MON, 7), 14, 1900), targets, today, startDate: MON });
  assert.equal(a.status, 'adherence');
  assert.equal(a.change, 0);
});

test('gaining too fast after the first weeks → −100–150 kcal; early water weight tolerated', () => {
  const late = addDays(MON, 49);
  const fast = calorieAdvice({ body: series(addDays(MON, 21), 28, 0.6), food: foodDays(addDays(MON, 35), 14, 2440), targets, today: late, startDate: MON });
  assert.equal(fast.status, 'fast');
  assert.ok(fast.change <= -100 && fast.change >= -150);
  const early = calorieAdvice({ body: series(MON, 18, 0.6), food: foodDays(MON, 18, 2440), targets, today: addDays(MON, 18), startDate: MON });
  assert.equal(early.status, 'early');
});

test('respects 2 weeks between adjustments', () => {
  const today = addDays(MON, 21);
  const a = calorieAdvice({ body: series(MON, 21, 0), food: foodDays(addDays(MON, 7), 14, 2440), targets, today, startDate: MON, lastAdjust: addDays(today, -5) });
  assert.equal(a.change, 0);
});

test('applying a calorie change keeps protein fixed', () => {
  const t = applyCalorieChange(targets, 150);
  assert.equal(t.kcal, 2590);
  assert.equal(t.protein, 160);
  assert.ok(Math.abs(macroKcal(t) - 2590) <= 10);
});

test('nutrition summary ignores incomplete days', () => {
  const n = nutritionSummary([...foodDays(MON, 5, 2440), { id: 'x', date: addDays(MON, 5), items: [{ k: 200, p: 5, c: 20, f: 5 }] }], targets, MON, addDays(MON, 6));
  assert.equal(n.logged, 5);
  assert.equal(n.avg.k, 2440);
});

test('coach answers all ten questions and never invents data on a fresh profile', () => {
  const S = { profile, targets, program: P, settings: {}, state: { startDate: MON }, workouts: [], food: [], body: [], photos: [], customFoods: [], meals: [], days: {} };
  const ctx = buildContext(S, MON, 9);
  const { qa, adv } = coachAnswers(ctx);
  assert.equal(qa.length, 10);
  assert.equal(adv.change, 0);
  assert.match(qa.find((x) => x.q.includes('stronger')).a, /Not enough/);
  assert.match(dailyMessage(ctx), /Calibration week/);
  const rep = weeklyReport(S, weekStart(MON), MON);
  assert.match(rep.lines[0], /^0\/3 sessions/);
});

/* ── Programme editing never loses history ── */
test('removed exercises stay addressable through the archive', () => {
  const p = cloneProgram();
  const removed = p.days.push.exercises.splice(0, 1)[0];
  p.archived = [removed];
  assert.ok(allExercises(p).bench.archived);
  assert.equal(DEFAULT_PROGRAM.days.push.exercises[0].id, 'bench'); // default untouched
  const all = Object.values(DEFAULT_PROGRAM.days).flatMap((d) => d.exercises.map((e) => e.id));
  assert.equal(new Set(all).size, all.length, 'exercise ids unique');
  assert.equal(all.length, 21);
});

/* ── Backup format ── */
test('backup validation rejects foreign files', () => {
  assert.equal(validate({ app: 'coach', kind: 'backup' }), 'backup');
  assert.equal(validate({ app: 'coach', kind: 'setup' }), 'setup');
  assert.throws(() => validate({ foo: 1 }));
});

/* ── Offline shell integrity ── */
test('service worker precaches every app file, and all exist', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const files = [...sw.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);
  for (const f of files) assert.ok(existsSync(new URL('../' + f, import.meta.url)), `missing ${f}`);
  const jsFiles = ['app', 'db', 'backup', 'util', 'engine', 'coach', 'program', 'foods', 'ui'];
  for (const j of jsFiles) assert.ok(files.includes(`js/${j}.js`), `sw missing js/${j}.js`);
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /apple-touch-icon/);
  assert.match(html, /manifest\.webmanifest/);
});

test('no personal data in the public code', () => {
  // The name to look for comes from the git-ignored private profile, so it never appears here.
  const priv = new URL('../private/profile.json', import.meta.url);
  const words = existsSync(priv) ? JSON.parse(readFileSync(priv, 'utf8')).profile.name.split(/\s+/).filter((w) => w.length > 2) : [];
  for (const f of ['js/app.js', 'js/program.js', 'js/coach.js', 'js/engine.js', 'js/foods.js', 'index.html', 'README.md', 'tests/engine.test.js']) {
    const s = readFileSync(new URL('../' + f, import.meta.url), 'utf8').toLowerCase();
    for (const w of words) assert.ok(!s.includes(w.toLowerCase()), `${f} contains personal data`);
  }
  const gi = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');
  assert.match(gi, /^private\/$/m);
});

test('ymd uses local dates', () => { assert.match(ymd(new Date(2026, 0, 5)), /^2026-01-05$/); });

test('nutrition verdict answers "did I reach my goal?"', async () => {
  const { nutritionVerdict, macroStatus } = await import('../js/engine.js');
  const T = { kcal: 2440, protein: 160, carbs: 270, fat: 80 };
  assert.equal(nutritionVerdict({ k: 0, p: 0 }, T, false).status, 'empty');
  assert.equal(nutritionVerdict({ k: 2400, p: 155 }, T, true).status, 'done');
  const todo = nutritionVerdict({ k: 1500, p: 80 }, T, true);
  assert.equal(todo.status, 'todo');
  assert.match(todo.text, /940 kcal and 80 g protein/);
  assert.match(nutritionVerdict({ k: 2400, p: 100 }, T, true).text, /60 g protein/);
  assert.equal(nutritionVerdict({ k: 3000, p: 170 }, T, true).status, 'over');
  assert.deepEqual([macroStatus(50, 100), macroStatus(100, 100), macroStatus(130, 100)], ['low', 'ok', 'high']);
});

test('focus advice is short, data-based and never empty', async () => {
  const { focusAdvice } = await import('../js/coach.js');
  const S = { profile, targets, program: P, settings: {}, state: { startDate: MON }, workouts: [], food: [], body: [], photos: [], customFoods: [], meals: [], days: {} };
  assert.match(focusAdvice(buildContext(S, MON))[0], /first workouts/);
  const today = addDays(MON, 13);
  S.workouts = [0, 7].map((d) => W(addDays(MON, d), 'push', [E('bench', [[60, 12], [60, 12], [60, 12]])]));
  const adv = focusAdvice(buildContext(S, today));
  assert.ok(adv.length >= 1 && adv.length <= 3);
  assert.ok(adv.some((a) => /least work/.test(a)), adv.join(' | '));
});

test('training history: stats, comparison and weekly summary', async () => {
  const { workoutStats, sessionComparison, weekTraining, previousOfSameDay } = await import('../js/engine.js');
  const w1 = W(MON, 'push', [E('bench', [[60, 12], [60, 12]]), E('abs_push', [[0, 15], [0, 15]])]);
  const w2 = W(addDays(MON, 7), 'push', [E('bench', [[62.5, 12], [62.5, 12]]), E('abs_push', [[0, 12]])]);
  assert.deepEqual(workoutStats(w1), { sets: 4, volume: 1440, exercises: 2, reps: 54 });
  assert.equal(previousOfSameDay([w1, w2], w2).id, w1.id);
  const cmp = sessionComparison([w1, w2], w2);
  assert.equal(cmp.find((c) => c.exId === 'bench').trend, 'up');
  assert.equal(cmp.find((c) => c.exId === 'abs_push').trend, 'down');
  const wk = weekTraining([w1, w2], addDays(MON, 8));
  assert.equal(wk.sessions, 1);
  assert.equal(wk.volume, 1500);
  assert.ok(Math.abs(wk.change - (1500 - 1440) / 1440) < 1e-9);
  assert.equal(wk.liftsUp, 1);
});

test('nutrition history gives a percentage and reached flag per day', async () => {
  const { nutritionHistory } = await import('../js/engine.js');
  const food = [{ id: 'a', date: MON, items: [{ k: 2440, p: 160, c: 270, f: 80 }] }, { id: 'b', date: addDays(MON, 1), items: [{ k: 1220, p: 80, c: 100, f: 30 }] }];
  const h = nutritionHistory(food, targets, addDays(MON, 1));
  assert.equal(h[0].date, addDays(MON, 1));
  assert.deepEqual([h[0].kcalPct, h[0].reached, h[1].kcalPct, h[1].reached], [50, false, 100, true]);
});

test('split templates are valid and switching keeps old exercises in the archive', async () => {
  const { SPLITS, applySplit } = await import('../js/program.js');
  for (const [k, sp] of Object.entries(SPLITS)) {
    const pr = sp.build();
    assert.ok(pr.rotation.length >= 1, k);
    for (const d of pr.rotation) { assert.ok(pr.days[d], `${k}.${d}`); assert.ok(pr.days[d].exercises.length >= 3, `${k}.${d} exercises`); }
    const ids = pr.rotation.flatMap((d) => pr.days[d].exercises.map((e) => e.id));
    for (const d of pr.rotation) { const dIds = pr.days[d].exercises.map((e) => e.id); assert.equal(new Set(dIds).size, dIds.length, `${k}.${d} unique`); }
    assert.ok(ids.length);
  }
  const ul = applySplit(cloneProgram(), 'upper_lower');
  assert.deepEqual(ul.rotation, ['upper', 'lower']);
  assert.equal(ul.perWeek, 4);
  assert.ok(ul.archived.some((e) => e.id === 'db_fly'), 'removed exercise archived');
  assert.ok(!ul.archived.some((e) => e.id === 'bench'), 'shared exercise not archived');
  assert.ok(allExercises(ul).db_fly.archived);
});

test('suggested targets for a new person', async () => {
  const { suggestTargets } = await import('../js/engine.js');
  const t = suggestTargets({ weight: 74, height: 179, age: 24, sex: 'male', targetWeight: 79 });
  assert.equal(t.protein, 148);
  assert.ok(t.kcal > 2700 && t.kcal < 3100, `${t.kcal}`);
  assert.ok(Math.abs(t.protein * 4 + t.carbs * 4 + t.fat * 9 - t.kcal) < 10);
  const cut = suggestTargets({ weight: 80, height: 170, age: 30, sex: 'female', targetWeight: 70 });
  assert.ok(cut.kcal < t.kcal);
  assert.equal(suggestTargets({ weight: 70 }), null);
});

test('after switching split, old workout days do not break the rotation', async () => {
  const { applySplit } = await import('../js/program.js');
  const ul = applySplit(cloneProgram(), 'upper_lower');
  const ws = [W(MON, 'push'), W(addDays(MON, 2), 'pull')];
  assert.equal(nextRotation(ul, ws), 'upper');
  const p = todayPlan(ul, ws, addDays(MON, 3), MON);
  assert.ok(['upper', 'lower'].includes(p.dayId || p.next));
});
