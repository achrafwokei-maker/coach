// Local, rule-based coach. Every statement is derived from recorded data; when data is
// missing it says so instead of guessing.
import { addDays, daysBetween, weekStart, r1, avg, fmtShort, fmtLong } from './util.js';
import {
  todayPlan, finishedWorkouts, nutritionSummary, totals, remaining, goalStatus, calorieAdvice,
  strengthTrend, performanceDip, weeklyVolume, prsInWorkout, GAIN_BAND, suggestMeals,
} from './engine.js';
import { allExercises } from './program.js';
import { FOODS, MEAL_TEMPLATES } from './foods.js';

const kg = (x) => `${r1(x)} kg`;
const signed = (x, d = 2) => `${x > 0 ? '+' : ''}${x.toFixed(d)}`;

export function buildContext(S, today, hour = 12) {
  const exMap = allExercises(S.program);
  const startDate = S.state.startDate || today;
  const plan = todayPlan(S.program, S.workouts, today, startDate);
  const todayFood = S.food.filter((e) => e.date === today);
  const tot = totals(todayFood);
  const rem = remaining(S.targets, tot);
  const goal = goalStatus(S.profile, S.body, today);
  const day = S.days[today] || {};
  const calibrating = daysBetween(startDate, today) < 7;
  return { S, today, hour, exMap, startDate, plan, tot, rem, goal, day, calibrating, foods: [...FOODS, ...S.customFoods] };
}

export function weightAssessment(ctx) {
  const { goal, today, startDate } = ctx;
  if (goal.rate == null) return { status: 'insufficient', text: 'Not enough weigh-ins yet to judge your rate of gain — weigh in 2–3 mornings a week (after the toilet, before eating).' };
  const r = goal.rate;
  const weeksIn = daysBetween(startDate, today) / 7;
  if (r < GAIN_BAND.lo) return { status: 'slow', text: `Gaining ${signed(r)} kg/week — slower than the lean-gain range (${GAIN_BAND.lo}–${GAIN_BAND.hi} kg/week).` };
  if (r > GAIN_BAND.hi) return { status: 'fast', text: `Gaining ${signed(r)} kg/week — faster than the lean-gain range${weeksIn < 4 ? ' (early weeks are partly water from creatine and more carbs)' : ''}.` };
  return { status: 'on-track', text: `Gaining ${signed(r)} kg/week — right in the lean-gain range (${GAIN_BAND.lo}–${GAIN_BAND.hi} kg/week).` };
}

export function recoveryAssessment(ctx) {
  const { S, today } = ctx;
  const last7 = Array.from({ length: 7 }, (_, i) => S.days[addDays(today, -i)]).filter(Boolean);
  const sleeps = last7.map((d) => d.sleep).filter((x) => x > 0);
  const energy = last7.map((d) => d.energy).filter((x) => x > 0);
  const dip = performanceDip(S.workouts);
  const notes = [];
  let status = 'ok';
  if (sleeps.length >= 3) {
    const a = avg(sleeps);
    if (a < 7) { notes.push(`Average sleep ${r1(a)} h — below the 7–9 h recommended for adults; muscle recovery suffers.`); status = 'warn'; }
    else notes.push(`Average sleep ${r1(a)} h — good.`);
  } else notes.push('Log sleep on the Today screen a few times a week to let me check recovery.');
  if (energy.length >= 3 && avg(energy) < 1.7) { notes.push('Energy has been low most days.'); status = 'warn'; }
  if (dip.flagged) { notes.push(`Performance dropped on ${dip.worse} of ${dip.total} exercises in your last sessions — consider an easier week (same weights, 1 set fewer) and extra sleep.`); status = 'warn'; }
  return { status, notes, dip };
}

export function strengthAssessment(ctx) {
  const st = strengthTrend(ctx.S.workouts, ctx.exMap, ctx.today);
  if (!st.rows.length) return { st, text: 'Not enough repeated sessions yet — strength trends appear after each exercise has been logged at least twice.' };
  return { st, text: `Over the last 6 weeks ${st.up} of ${st.rows.length} exercises got stronger${st.down ? `, ${st.down} went down` : ''} (average ${signed(st.avgChange * 100, 1)}% estimated 1-rep max).` };
}

export function nutritionAssessment(ctx) {
  const { S, today } = ctx;
  const n = nutritionSummary(S.food, S.targets, addDays(today, -7), addDays(today, -1));
  if (n.logged < 3) return { n, text: `Food logged on ${n.logged} of the last 7 days — log at least most days so I can judge if you're eating enough.` };
  const pk = r1(n.avg.p / (ctx.goal.current || S.profile.startWeight));
  return { n, text: `Last 7 days: ${n.avg.k} kcal and ${n.avg.p} g protein on average (${pk} g/kg). Protein target hit on ${n.proteinHit}/${n.logged} logged days.` };
}

// Answers to the coach's core questions, from data.
export function coachAnswers(ctx) {
  const { S, plan, rem, goal, today } = ctx;
  const dayName = (id) => S.program.days[id]?.name || id;
  const w = weightAssessment(ctx);
  const adv = calorieAdvice({ body: S.body, food: S.food, targets: S.targets, today, startDate: ctx.startDate, lastAdjust: S.state.lastAdjust });
  const strength = strengthAssessment(ctx);
  const rec = recoveryAssessment(ctx);
  const nut = nutritionAssessment(ctx);
  const sugg = suggestMeals(rem, MEAL_TEMPLATES, ctx.foods, ctx.hour, 1)[0];
  const qa = [];
  qa.push({ q: 'What should I train today?', a: plan.type === 'train' ? `${dayName(plan.dayId)} day${plan.reason === 'catch-up' ? ' — catching up a missed session' : ''}.` : plan.type === 'done' ? `Done: ${dayName(plan.dayId)} completed today. Next: ${dayName(plan.next)}.` : `Rest day. Next session: ${dayName(plan.next)}.` });
  qa.push({ q: 'How much weight should I lift?', a: 'Open Training — each exercise shows today’s weight and why. During calibration, choose a weight that leaves 2–3 reps in reserve.' });
  qa.push({ q: 'Am I becoming stronger?', a: strength.text });
  qa.push({ q: 'Am I eating enough to build muscle?', a: `${nut.text} ${w.text}` });
  qa.push({ q: 'What do I still need today?', a: rem.k > 0 ? `${rem.k} kcal · ${Math.max(0, rem.p)} g protein · ${Math.max(0, rem.c)} g carbs · ${Math.max(0, rem.f)} g fat.` : `Calorie target reached (${-rem.k} kcal over).${rem.p > 0 ? ` Still ${rem.p} g protein to go.` : ''}` });
  qa.push({ q: 'What should I eat next?', a: sugg ? `${sugg.name}: about ${sugg.tot.k} kcal and ${Math.round(sugg.tot.p)} g protein.` : 'You have covered today’s targets — nothing more needed.' });
  qa.push({ q: 'Am I recovering properly?', a: rec.notes.join(' ') });
  qa.push({ q: 'Am I gaining too fast or too slow?', a: `${w.text} ${calorieAdviceText(adv)}` });
  qa.push({ q: 'Am I on track for the goal?', a: goal.eta ? `At the current rate you reach ${S.profile.targetWeight} kg around ${fmtShort(goal.eta)} ${goal.eta.slice(0, 4)}.` : `Current ${kg(goal.current)} of ${kg(S.profile.targetWeight)}. Not enough trend data to project a date yet — the plan is ${S.profile.planMonths || '6–10'} months.` });
  qa.push({ q: 'What should I improve this week?', a: focusThisWeek(ctx, { w, nut, rec }) });
  return { qa, adv, w, rec, nut, strength };
}

export function calorieAdviceText(adv) {
  if (adv.status === 'insufficient') return `No calorie change yet: ${adv.reasons.join('; ')}.`;
  if (adv.status === 'adherence' || adv.status === 'early') return `No calorie change yet: ${adv.reasons[0]}.`;
  if (adv.change > 0) return `Suggestion: +${adv.change} kcal/day (mostly carbs) — you can apply it in Progress.`;
  if (adv.change < 0) return `Suggestion: ${adv.change} kcal/day to keep the gain lean — you can apply it in Progress.`;
  return 'Calories are fine — keep them as they are.';
}

function focusThisWeek(ctx, { w, nut, rec }) {
  const { S, today } = ctx;
  const ws = weekStart(today);
  const sessions = finishedWorkouts(S.workouts).filter((x) => x.date >= addDays(ws, -7) && x.date < ws).length;
  const items = [];
  if (nut.n.logged < 5) items.push('log your food on most days');
  else if (nut.n.proteinHit < nut.n.logged * 0.7) items.push(`reach ${S.targets.protein} g protein more consistently`);
  if (rec.status === 'warn') items.push('prioritise sleep (7–9 h)');
  if (w.status === 'insufficient') items.push('weigh in 2–3 mornings');
  if (sessions < (S.program.perWeek || 3) && daysBetween(ctx.startDate, today) >= 7) items.push(`complete all ${S.program.perWeek || 3} sessions`);
  const creatineDays = Array.from({ length: 7 }, (_, i) => S.days[addDays(today, -1 - i)]).filter((d) => d?.creatine).length;
  if (creatineDays < 6 && daysBetween(ctx.startDate, today) >= 7) items.push('take creatine daily (it works through saturation, timing doesn’t matter)');
  if (!items.length) return 'Everything is on track — keep the same habits and push for one more rep where you can.';
  return `Focus: ${items.slice(0, 2).join(' and ')}.`;
}

// One short sentence for the top of Today.
export function dailyMessage(ctx) {
  const { S, plan, rem, hour, calibrating, day } = ctx;
  const name = S.profile.name ? S.profile.name.split(' ')[0] : '';
  const rec = recoveryAssessment(ctx);
  const dayName = S.program.days[plan.dayId || plan.next]?.name || '';
  if (calibrating && plan.type === 'train') return `Calibration week, ${name}: ${dayName} today. Lift what feels right with 2–3 reps in reserve and log it — I’ll build your baseline from it.`;
  if (rec.dip.flagged && plan.type === 'train') return `${dayName} today — your last sessions dipped, so keep weights steady and focus on clean reps. Sleep is your best supplement tonight.`;
  if (plan.type === 'train') return plan.reason === 'catch-up' ? `You missed a session this week — ${dayName} today keeps the rotation on track.` : `${dayName} day. Your weights are ready — beat last time by one rep or one step.`;
  if (plan.type === 'done') return rem.p > 30 ? `Great session. Recovery starts with food: ${Math.round(rem.p)} g protein still to go today.` : 'Session done and nutrition on point. Rest well.';
  if (!day.creatine && hour >= 10) return `Rest day — muscles grow today. Don’t forget your ${S.profile.creatine || 5} g creatine.`;
  if (rem.p > 60 && hour >= 15) return `Rest day, but protein is behind: ${Math.round(rem.p)} g left. A protein-rich dinner fixes it.`;
  return 'Rest day — eat to your targets and sleep 7–9 h. That’s where growth happens.';
}

// Weekly report for the Monday-based week containing `ws`.
export function weeklyReport(S, ws, today) {
  const we = addDays(ws, 6);
  const exMap = allExercises(S.program);
  const wk = finishedWorkouts(S.workouts).filter((w) => w.date >= ws && w.date <= we);
  const prs = wk.flatMap((w) => prsInWorkout(S.workouts, w));
  const vol = weeklyVolume(S.workouts, exMap, ws, we);
  const nut = nutritionSummary(S.food, S.targets, ws, we < today ? we : today);
  const wts = S.body.filter((b) => b.weight > 0 && b.date >= ws && b.date <= we).map((b) => b.weight);
  const prevW = S.body.filter((b) => b.weight > 0 && b.date >= addDays(ws, -7) && b.date < ws).map((b) => b.weight);
  const creatine = Array.from({ length: 7 }, (_, i) => S.days[addDays(ws, i)]).filter((d) => d?.creatine).length;
  const lines = [];
  lines.push(`${wk.length}/${S.program.perWeek || 3} sessions${wk.length ? ` (${wk.map((w) => S.program.days[w.dayId]?.name || w.dayId).join(', ')})` : ''}.`);
  if (prs.length) lines.push(`${prs.length} personal record${prs.length > 1 ? 's' : ''}: ${prs.slice(0, 3).map((p) => p.name).join(', ')}${prs.length > 3 ? '…' : ''}.`);
  if (nut.avg) lines.push(`Nutrition: ${nut.avg.k} kcal, ${nut.avg.p} g protein avg on ${nut.logged} logged days.`);
  else lines.push('No complete food days logged.');
  if (wts.length && prevW.length) lines.push(`Weight: ${kg(avg(wts))} avg (${signed(avg(wts) - avg(prevW), 1)} kg vs previous week).`);
  else if (wts.length) lines.push(`Weight: ${kg(avg(wts))} avg.`);
  lines.push(`Creatine: ${creatine}/7 days.`);
  const sets = Object.values(vol).reduce((a, b) => a + b, 0);
  return { ws, we, title: `Week of ${fmtShort(ws)}`, lines, sessions: wk.length, prs, vol, sets: Math.round(sets), nut, creatine };
}

export { fmtLong };
