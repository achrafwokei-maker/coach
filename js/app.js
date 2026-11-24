import * as db from './db.js';
import { exportAll, importFile, shareJSON } from './backup.js';
import { ymd, addDays, daysBetween, weekStart, fmtShort, fmtLong, fmtMonthYear, addMonths, uid, esc, r1, norm, byDate, dayName, clamp } from './util.js';
import { DEFAULT_PROGRAM, cloneProgram, allExercises, EQUIP } from './program.js';
import { FOODS, MEAL_TEMPLATES } from './foods.js';
import {
  exerciseHistory, recommend, personalRecords, prsInWorkout, weeklyVolume, DIFFICULTY, itemFrom, totals,
  parseFoodText, suggestMeals, weights, goalStatus, calorieAdvice, applyCalorieChange, macroKcal, dailyTotals, finishedWorkouts, e1rm,
} from './engine.js';
import { buildContext, coachAnswers, dailyMessage, weeklyReport, calorieAdviceText } from './coach.js';
import { icon, ring, bar, lineChart, barChart, STATUS } from './ui.js';

export const APP_VERSION = '1.0.0';
const $ = (s, el = document) => el.querySelector(s);
const main = $('#main');
const sheetEl = $('#sheet');

/* ───────────────────────── State ───────────────────────── */
const DEFAULT_TARGETS = { kcal: 2400, protein: 150, carbs: 270, fat: 75, creatine: 5 };
const DEFAULT_SETTINGS = { restTimer: true, checkInterval: 7, theme: 'system' };
const S = {
  profile: null, targets: null, program: null, settings: null, state: null,
  workouts: [], food: [], body: [], photos: [], customFoods: [], meals: [], days: {}, active: null,
};
const UI = { tab: 'today', sheet: null, timer: null, mealDraft: null, progressEx: null, editDay: 'push', toast: null };

async function load() {
  S.profile = await db.kvGet('profile', null);
  S.targets = { ...DEFAULT_TARGETS, ...(await db.kvGet('targets', {})) };
  S.program = await db.kvGet('program', null) || cloneProgram(DEFAULT_PROGRAM);
  S.settings = { ...DEFAULT_SETTINGS, ...(await db.kvGet('settings', {})) };
  S.state = await db.kvGet('state', {}) || {};
  S.active = await db.kvGet('active', null);
  S.workouts = (await db.all('workouts')).sort(byDate);
  S.food = (await db.all('food')).sort(byDate);
  S.body = (await db.all('body')).sort(byDate);
  S.photos = (await db.all('photos')).sort(byDate);
  S.customFoods = await db.all('customFoods');
  S.meals = await db.all('meals');
  S.days = Object.fromEntries((await db.all('days')).map((d) => [d.date, d]));
  if (!S.state.startDate && S.profile) { S.state.startDate = S.profile.startDate || ymd(); await db.kvSet('state', S.state); }
}
const saveKV = (k) => db.kvSet(k, S[k]);
const today = () => ymd();
const hour = () => new Date().getHours();
const allFoods = () => [...S.customFoods, ...FOODS];
const exMap = () => allExercises(S.program);
const dayLabel = (id) => S.program.days[id]?.name || id;

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(UI.toast); UI.toast = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ───────────────────────── Render root ───────────────────────── */
function render() {
  applyTheme();
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.tab === UI.tab));
  document.body.classList.toggle('onboarding', !S.profile);
  if (!S.profile) { main.innerHTML = viewOnboarding(); return; }
  const y = main.scrollTop;
  main.innerHTML = UI.tab === 'today' ? viewToday() : UI.tab === 'training' ? viewTraining() : viewProgress();
  main.scrollTop = y;
  loadThumbs(main);
}
function renderSheet() {
  if (!UI.sheet) { sheetEl.className = 'sheet'; sheetEl.innerHTML = ''; document.body.classList.remove('locked'); return; }
  const body = $('.sheet-body', sheetEl);
  const y = body ? body.scrollTop : 0;
  const same = sheetEl.dataset.kind === UI.sheet.kind;
  const html = SHEETS[UI.sheet.kind](UI.sheet);
  sheetEl.dataset.kind = UI.sheet.kind;
  sheetEl.className = `sheet open ${UI.sheet.full ? 'full' : ''}`;
  sheetEl.innerHTML = `<div class="sheet-backdrop" data-act="close-sheet"></div><div class="sheet-panel">${html}</div>`;
  document.body.classList.add('locked');
  const nb = $('.sheet-body', sheetEl);
  if (nb && same) nb.scrollTop = y;
  loadThumbs(sheetEl);
}
function openSheet(kind, data = {}) { UI.sheet = { kind, ...data }; sheetEl.dataset.kind = ''; renderSheet(); }
function closeSheet() { UI.sheet = null; renderSheet(); render(); }

function applyTheme() {
  const t = S.settings?.theme || 'system';
  document.documentElement.dataset.theme = t;
}

// Lazy-load image blobs from IndexedDB into <img data-photo="id">
const urlCache = new Map();
function loadThumbs(root) {
  root.querySelectorAll('img[data-photo]').forEach((img) => {
    const id = img.dataset.photo, full = img.dataset.full === '1';
    const key = id + (full ? ':f' : ':t');
    if (urlCache.has(key)) { img.src = urlCache.get(key); return; }
    const p = S.photos.find((x) => x.id === id) || S.food.find((f) => f.photo?.id === id)?.photo || (UI.mealDraft?.photo?.id === id ? UI.mealDraft.photo : null);
    const blob = p && (full ? p.blob : p.thumb || p.blob);
    if (blob) { const u = URL.createObjectURL(blob); urlCache.set(key, u); img.src = u; }
  });
}

/* ───────────────────────── Onboarding ───────────────────────── */
function viewOnboarding() {
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  return `<section class="onb">
    <div class="brand-mark">${icon('bolt')}</div>
    <h1>Your coach,<br>on your phone.</h1>
    <p class="muted">Everything stays on this iPhone. No account, no cloud.</p>
    ${!standalone && /iphone|ipad/i.test(navigator.userAgent) ? `<div class="card hint"><b>Install first.</b> Tap the Share button in Safari, then <b>Add to Home Screen</b>, and open the app from there. Data entered in Safari is kept separately from the installed app.</div>` : ''}
    <div class="card">
      <h3>Have a setup file?</h3>
      <p class="muted small">Import the private setup file (profile, targets and starting photo) or a backup.</p>
      <label class="btn primary block">Import setup or backup<input type="file" accept="application/json,.json" data-in="import-file" hidden></label>
    </div>
    <div class="card">
      <h3>Or set up manually</h3>
      <div class="grid2">
        <label class="field"><span>First name</span><input id="o-name" autocomplete="given-name"></label>
        <label class="field"><span>Age</span><input id="o-age" inputmode="numeric"></label>
        <label class="field"><span>Height (cm)</span><input id="o-height" inputmode="decimal"></label>
        <label class="field"><span>Weight now (kg)</span><input id="o-weight" inputmode="decimal"></label>
        <label class="field"><span>Target weight (kg)</span><input id="o-target" inputmode="decimal"></label>
        <label class="field"><span>Creatine (g/day)</span><input id="o-creat" inputmode="decimal" value="5"></label>
      </div>
      <button class="btn primary block" data-act="onb-save">Start</button>
    </div></section>`;
}

async function onboardSave() {
  const v = (id) => $(`#${id}`).value.trim();
  const w = parseFloat(v('o-weight')), t = parseFloat(v('o-target'));
  if (!(w > 30) || !(t > 30)) return toast('Enter your current and target weight.');
  S.profile = { name: v('o-name'), age: +v('o-age') || null, height: +v('o-height') || null, startWeight: w, targetWeight: t, creatine: +v('o-creat') || 5, planMonths: 8, startDate: today() };
  S.state.startDate = today();
  await saveKV('profile'); await saveKV('state'); await saveKV('targets'); await saveKV('program');
  await addBody({ date: today(), weight: w });
  render();
}

/* ───────────────────────── TODAY ───────────────────────── */
function viewToday() {
  const ctx = buildContext(S, today(), hour());
  const { plan, tot, rem, goal, day } = ctx;
  const T = S.targets;
  const msg = dailyMessage(ctx);
  const foodToday = S.food.filter((e) => e.date === today()).sort(byDate);
  const sugg = suggestMeals(rem, MEAL_TEMPLATES, allFoods(), hour(), 2);
  const due = checkInDue();
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  const next = goal.milestones.find((m) => !m.reached);
  const day0 = S.program.days[plan.dayId || plan.next];
  const nextDate = nextTrainingDate();

  let workoutCard;
  if (S.active) {
    workoutCard = `<div class="card workout live"><div class="eyebrow">In progress</div><h2>${esc(dayLabel(S.active.dayId))}</h2>
      <p class="muted">${S.active.exercises.filter((e) => e.sets.some((s) => s.done)).length}/${S.active.exercises.length} exercises started</p>
      <button class="btn primary block" data-act="resume-workout">Resume workout</button></div>`;
  } else if (plan.type === 'train') {
    workoutCard = `<div class="card workout"><div class="eyebrow">${plan.reason === 'catch-up' ? 'Catch-up session' : 'Today’s workout'}${ctx.calibrating ? ' · calibration' : ''}</div>
      <h2>${esc(day0.name)}</h2>
      <p class="muted">${day0.exercises.length} exercises · ${esc(day0.warmup[0])}</p>
      <button class="btn primary block lg" data-act="start-workout" data-day="${plan.dayId}">Start workout</button></div>`;
  } else if (plan.type === 'done') {
    const w = plan.workout;
    const mins = w.end && w.t ? Math.round((w.end - w.t) / 60000) : null;
    const prs = prsInWorkout(S.workouts, w);
    workoutCard = `<div class="card workout done"><div class="eyebrow">Completed</div><h2>${esc(dayLabel(w.dayId))} ${icon('check', 'ok')}</h2>
      <p class="muted">${mins ? `${mins} min · ` : ''}${prs.length ? `${prs.length} personal record${prs.length > 1 ? 's' : ''}` : 'Logged'} · Next: ${esc(dayLabel(plan.next))}</p></div>`;
  } else {
    workoutCard = `<div class="card workout rest"><div class="eyebrow">Rest day</div><h2>Recover</h2>
      <p class="muted">Next: <b>${esc(dayLabel(plan.next))}</b>${nextDate ? ` · ${fmtLong(nextDate).split(' ')[0]}` : ''}</p>
      <button class="btn ghost block" data-act="start-workout" data-day="${plan.next}">Train anyway</button></div>`;
  }

  const macro = (k, label, val, target, unit) => {
    const left = r1(target - val);
    return `<div class="macro"><div class="macro-top"><span>${label}</span><b>${Math.round(val)}<small>/${target}${unit}</small></b></div>${bar(val, target, k)}<div class="macro-left ${left < 0 ? 'neg' : ''}">${left >= 0 ? `${Math.round(left)}${unit} left` : `${Math.round(-left)}${unit} over`}</div></div>`;
  };

  return `<header class="top"><div><div class="date">${fmtLong(today())}</div><h1>Today</h1></div>
      <button class="icon-btn" data-act="open-settings" aria-label="Settings">${icon('gear')}</button></header>
    ${!standalone && /iphone/i.test(navigator.userAgent) ? `<div class="card hint small">Tip: install via Share → <b>Add to Home Screen</b> for offline use and full-screen.</div>` : ''}
    <div class="coach-line" data-act="open-coach">${icon('spark')}<p>${esc(msg)}</p>${icon('chev', 'dim')}</div>
    ${workoutCard}
    <div class="card nutrition">
      <div class="nut-head">${ring(tot.k, T.kcal, 128, 11, `${Math.max(0, rem.k)}`, rem.k >= 0 ? 'kcal left' : `${-rem.k} over`)}
        <div class="macros">${macro('p', 'Protein', tot.p, T.protein, 'g')}${macro('c', 'Carbs', tot.c, T.carbs, 'g')}${macro('f', 'Fat', tot.f, T.fat, 'g')}</div></div>
      <button class="btn primary block" data-act="add-meal">${icon('plus')} Add meal</button>
      ${foodToday.length ? `<ul class="entries">${foodToday.map((e) => `<li data-act="edit-meal" data-id="${e.id}">
          ${e.photo ? `<img class="thumb-sm" data-photo="${e.photo.id}" alt="">` : `<span class="dot-ic">${icon('today')}</span>`}
          <div><b>${esc(e.name || e.meal)}</b><span>${esc(e.items.map((i) => i.n).join(', '))}</span></div><em>${totals([e]).k}<small> kcal</small></em></li>`).join('')}</ul>` : ''}
      ${sugg.length ? `<div class="suggest"><div class="eyebrow">What to eat next</div>${sugg.map((s, i) => `<button class="sugg" data-act="log-suggestion" data-i="${i}">
          <div><b>${esc(s.name)}</b><span>${s.items.map((it) => `${it.g} g ${it.n.split(',')[0].split('(')[0].trim().toLowerCase()}`).join(' · ')}</span></div>
          <em>${s.tot.k} kcal<br><small>${Math.round(s.tot.p)} g P</small></em></button>`).join('')}</div>` : ''}
    </div>
    <div class="row-cards">
      <button class="card tick ${day.creatine ? 'on' : ''}" data-act="toggle-creatine"><span class="tickbox">${icon('check')}</span><div><b>Creatine</b><span>${S.profile.creatine || 5} g today</span></div></button>
      <button class="card goal-mini" data-act="tab" data-tab="progress"><div class="eyebrow">Goal</div><b>${r1(goal.current)} <small>→ ${goal.target} kg</small></b>${bar(goal.progress, 1, 'goal')}<span>${next ? `Next: ${next.kg} kg` : 'Goal reached'}</span></button>
    </div>
    ${due ? `<button class="card due" data-act="open-checkin">${icon('camera')}<div><b>${due}</b><span>Weight${S.settings.checkInterval ? ', photos' : ''} and optional measurements · 1 minute</span></div>${icon('chev', 'dim')}</button>` : ''}
    <div class="card checkin"><div class="eyebrow">Recovery check-in <span class="muted">· optional</span></div>
      <div class="chips-row"><span>Sleep</span>${[5, 6, 7, 8, 9].map((h) => `<button class="chip ${day.sleep === h ? 'on' : ''}" data-act="set-sleep" data-v="${h}">${h}${h === 9 ? '+' : ''}h</button>`).join('')}</div>
      <div class="chips-row"><span>Energy</span>${[['Low', 1], ['OK', 2], ['High', 3]].map(([l, v]) => `<button class="chip ${day.energy === v ? 'on' : ''}" data-act="set-energy" data-v="${v}">${l}</button>`).join('')}</div>
      <button class="link" data-act="quick-weight">${icon('plus')} Log today’s weight</button>
    </div>
    <div class="spacer"></div>`;
}

function nextTrainingDate() {
  const days = S.program.trainingDays || [];
  for (let i = 1; i <= 7; i++) { const d = addDays(today(), i); if (days.includes(new Date(d + 'T12:00').getDay())) return d; }
  return null;
}

function checkInDue() {
  const n = S.settings.checkInterval || 7;
  const lastW = weights(S.body).at(-1)?.date;
  const lastP = S.photos.filter((p) => p.kind === 'progress').at(-1)?.date;
  if (!lastP) return 'Add your starting photos';
  if (daysBetween(lastP, today()) >= n) return `Progress check-in (every ${n} days)`;
  if (!lastW || daysBetween(lastW, today()) >= 7) return 'Weekly weigh-in';
  return null;
}

/* ───────────────────────── TRAINING ───────────────────────── */
function viewTraining() {
  const ctx = buildContext(S, today(), hour());
  const { plan } = ctx;
  const dayId = S.active?.dayId || (plan.type === 'train' ? plan.dayId : plan.next);
  const day = S.program.days[dayId];
  const map = exMap();
  const ws = weekStart(today());
  const vol = weeklyVolume(S.workouts, map, ws, addDays(ws, 6));
  const volRows = Object.entries(vol).sort((a, b) => b[1] - a[1]);
  const fin = finishedWorkouts(S.workouts);
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(ws, -7 * (7 - i)));
  const perWeek = weeks.map((w) => ({ label: fmtShort(w).split(' ')[0], v: fin.filter((x) => x.date >= w && x.date <= addDays(w, 6)).length }));
  const tracked = Object.values(map).filter((e) => exerciseHistory(S.workouts, e.id).length);

  return `<header class="top"><div><div class="date">${plan.type === 'train' ? 'Today' : 'Next session'}</div><h1>Training</h1></div>
      <button class="icon-btn" data-act="open-program" aria-label="Edit programme">${icon('edit')}</button></header>
    <div class="card">
      <div class="row-between"><div><div class="eyebrow">${plan.type === 'train' ? 'Today' : plan.type === 'done' ? 'Done today · next up' : 'Next up'}</div><h2>${esc(day.name)}</h2></div>
      <button class="btn primary" data-act="${S.active ? 'resume-workout' : 'start-workout'}" data-day="${dayId}">${S.active ? 'Resume' : 'Start'}</button></div>
      <p class="muted small">Warm-up: ${day.warmup.map(esc).join(' · ')}</p>
      <ul class="ex-list">${day.exercises.map((e) => {
        const h = exerciseHistory(S.workouts, e.id);
        const rec = recommend(e, h, today());
        const st = STATUS[rec.status];
        return `<li data-act="open-exercise" data-id="${e.id}"><div><b>${esc(e.name)}</b>
          <span>${e.sets[0]}–${e.sets[1]} × ${e.reps[0] === e.reps[1] ? e.reps[0] : e.reps.join('–')}${h.length ? ` · last ${h.at(-1).top ? `${h.at(-1).top} kg` : ''} × ${h.at(-1).sets.map((s) => s.r).join('/')}` : ''}</span></div>
          <em class="pill ${st.cls}">${icon(st.icon)}${rec.weight != null ? `${rec.weight} kg` : st.label}</em></li>`;
      }).join('')}</ul>
      <p class="muted small">Finish: ${esc(day.finisher)}</p>
    </div>
    <div class="card"><div class="eyebrow">This week · sets per muscle</div>
      ${volRows.length ? `<div class="vol">${volRows.map(([m, v]) => `<div class="vol-row"><span>${m}</span>${bar(v, 20, 'vol')}<b>${r1(v)}</b></div>`).join('')}</div>
      <p class="muted small">Most people grow well on roughly 10–20 sets per muscle per week. Secondary muscles count as half a set.</p>` : `<p class="muted">No sets logged this week yet.</p>`}
    </div>
    <div class="card"><div class="eyebrow">Consistency · sessions per week</div>${barChart(perWeek.map((p) => ({ ...p, hit: p.v >= (S.program.perWeek || 3) })), S.program.perWeek || 3)}
      <p class="muted small">${fin.length} sessions logged in total.</p></div>
    <div class="card"><div class="eyebrow">Exercise history & records</div>
      ${tracked.length ? `<ul class="ex-list">${tracked.map((e) => { const pr = personalRecords(exerciseHistory(S.workouts, e.id));
        return `<li data-act="open-exercise" data-id="${e.id}"><div><b>${esc(e.name)}${e.archived ? ' <small class="muted">(removed)</small>' : ''}</b><span>Best ${pr.heaviest.value} kg · e1RM ${pr.e1rm.value} kg</span></div>${icon('chev', 'dim')}</li>`; }).join('')}</ul>`
        : '<p class="muted">Your records appear here after your first session.</p>'}
    </div>
    <div class="spacer"></div>`;
}

/* ───────────────────────── Workout ───────────────────────── */
function buildWorkout(dayId) {
  const day = S.program.days[dayId];
  return {
    id: uid(), date: today(), dayId, t: Date.now(),
    exercises: day.exercises.map((e) => {
      const h = exerciseHistory(S.workouts, e.id);
      const rec = recommend(e, h, today());
      const last = h.at(-1);
      const n = rec.sets || e.sets[1];
      const sets = Array.from({ length: n }, (_, i) => {
        // Prefill what you did last time; the recommendation shows the target.
        const prevR = last?.sets.filter((s) => s.w === last.top)[i]?.r ?? last?.sets[i]?.r;
        const r = prevR || rec.reps || e.reps[1];
        return { w: rec.weight ?? (last ? last.top : ''), r, done: false };
      });
      return { exId: e.id, name: e.name, equip: e.equip, sets, diff: null, pain: false, skipped: false, rec };
    }),
  };
}

async function startWorkout(dayId) {
  if (!S.active) { S.active = buildWorkout(dayId); await saveKV('active'); }
  openSheet('workout', { full: true });
}

function viewWorkout() {
  const w = S.active;
  if (!w) return '';
  const day = S.program.days[w.dayId] || { name: w.dayId, warmup: [], finisher: '' };
  const map = exMap();
  const timer = UI.timer;
  return `<div class="sheet-head"><button class="icon-btn" data-act="close-sheet" aria-label="Minimise">${icon('down')}</button>
      <div class="center"><b>${esc(day.name)}</b><span id="elapsed">${elapsed(w.t)}</span></div>
      <button class="btn primary sm" data-act="finish-workout">Finish</button></div>
    <div class="sheet-body">
      <div class="warm"><span class="eyebrow">Warm-up</span> ${day.warmup.map(esc).join(' · ')}</div>
      ${w.exercises.map((e, i) => {
        const ex = map[e.exId] || { sets: [2, 3], reps: [10, 12], equip: e.equip, rest: 90 };
        const rec = e.rec || {};
        const st = STATUS[rec.status] || STATUS.maintain;
        const last = rec.prev;
        const unit = EQUIP[ex.equip]?.unit || 'kg';
        const bw = ex.equip === 'bodyweight';
        const allDone = e.sets.length && e.sets.every((s) => s.done);
        return `<section class="wx ${e.skipped ? 'skipped' : ''} ${allDone ? 'complete' : ''}" id="wx-${i}">
          <div class="wx-head"><div><h3>${esc(e.name)}</h3><span class="muted small">${ex.sets[0]}–${ex.sets[1]} sets × ${ex.reps[0] === ex.reps[1] ? ex.reps[0] : ex.reps.join('–')} reps${bw ? '' : ` · ${unit}`}${ex.note ? ` · ${esc(ex.note)}` : ''}</span></div>
            <em class="pill ${st.cls}">${icon(st.icon)}${rec.weight != null ? `${rec.weight} kg` : st.label}</em></div>
          <p class="why">${esc(rec.why || '')}</p>
          ${last ? `<p class="last">Last (${fmtShort(last.date)}): ${last.sets.map((s) => `${bw ? '' : `${s.w}×`}${s.r}`).join(' · ')}${last.diff ? ` · ${DIFFICULTY[last.diff].label}` : ''}</p>` : ''}
          ${e.skipped ? `<button class="link" data-act="unskip" data-i="${i}">Skipped — tap to restore</button>` : `
          <div class="sets"><div class="set-h"><span>Set</span><span>${bw ? '' : 'kg'}</span><span>Reps</span><span></span></div>
          ${e.sets.map((s, j) => `<div class="set ${s.done ? 'done' : ''}"><span class="n">${j + 1}</span>
            ${bw ? '<span></span>' : `<input inputmode="decimal" value="${s.w}" data-in="set-w" data-i="${i}" data-j="${j}" aria-label="Weight set ${j + 1}">`}
            <input inputmode="numeric" value="${s.r}" data-in="set-r" data-i="${i}" data-j="${j}" aria-label="Reps set ${j + 1}">
            <button class="tick-btn" data-act="toggle-set" data-i="${i}" data-j="${j}" aria-label="Complete set">${icon('check')}</button></div>`).join('')}</div>
          <div class="wx-actions"><button class="link" data-act="add-set" data-i="${i}">${icon('plus')} Set</button>
            ${e.sets.length > 1 ? `<button class="link" data-act="remove-set" data-i="${i}">${icon('minus')} Set</button>` : ''}
            <button class="link" data-act="skip" data-i="${i}">Skip</button>
            <button class="link ${e.pain ? 'danger' : ''}" data-act="toggle-pain" data-i="${i}">${e.pain ? 'Pain flagged' : 'Pain?'}</button></div>
          <div class="diff"><span class="muted small">How did it feel?</span><div class="seg">${Object.entries(DIFFICULTY).map(([k, d]) => `<button class="${e.diff === k ? 'on' : ''} d-${k}" data-act="set-diff" data-i="${i}" data-v="${k}">${d.label}</button>`).join('')}</div>
            ${e.diff ? `<span class="muted small">≈ ${DIFFICULTY[e.diff].rir}</span>` : ''}</div>
          ${e.pain ? '<p class="warn small">Stop the set if it hurts. Reduce load, shorten the range of motion, or swap the exercise. Pain that persists needs a professional’s opinion.</p>' : ''}`}
        </section>`;
      }).join('')}
      <div class="warm"><span class="eyebrow">Finish</span> ${esc(day.finisher)}</div>
      <button class="btn ghost block danger-text" data-act="discard-workout">Discard workout</button>
      <div class="spacer"></div>
    </div>
    ${timer ? `<div class="rest-bar" id="rest-bar"><span>${icon('timer')} Rest</span><b id="rest-left">${fmtSec(Math.max(0, Math.round((timer.end - Date.now()) / 1000)))}</b>
      <button class="chip" data-act="rest-add">+15s</button><button class="chip" data-act="rest-skip">Skip</button></div>` : ''}`;
}

const fmtSec = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const elapsed = (t) => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); const h = Math.floor(s / 3600); return h ? `${h}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : fmtSec(s); };

function startRest(seconds) {
  if (!S.settings.restTimer) return;
  UI.timer = { end: Date.now() + seconds * 1000, beeped: false };
}
let audioCtx;
function beep() {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = 880; g.gain.value = 0.08; o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + 0.25);
  } catch { /* no audio */ }
  navigator.vibrate?.(200);
}
setInterval(() => {
  const el = document.getElementById('elapsed');
  if (el && S.active) el.textContent = elapsed(S.active.t);
  if (UI.timer) {
    const left = Math.round((UI.timer.end - Date.now()) / 1000);
    const rl = document.getElementById('rest-left');
    if (rl) rl.textContent = fmtSec(Math.max(0, left));
    if (left <= 0 && !UI.timer.beeped) { UI.timer.beeped = true; beep(); $('#rest-bar')?.classList.add('done'); }
    if (left < -20) { UI.timer = null; if (UI.sheet?.kind === 'workout') renderSheet(); }
  }
}, 1000);

async function finishWorkout() {
  const w = S.active;
  const anyDone = w.exercises.some((e) => e.sets.some((s) => s.done && +s.r > 0));
  if (!anyDone) { toast('Complete at least one set, or discard the workout.'); return; }
  const missingDiff = w.exercises.filter((e) => !e.skipped && e.sets.some((s) => s.done) && !e.diff).length;
  if (missingDiff && !confirm(`${missingDiff} exercise(s) have no difficulty rating. Ratings make the weight recommendations smarter. Finish anyway?`)) return;
  const rec = {
    ...w, end: Date.now(), finished: true,
    exercises: w.exercises.map(({ rec, ...e }) => ({ ...e, sets: e.sets.map((s) => ({ w: parseFloat(s.w) || 0, r: parseInt(s.r, 10) || 0, done: s.done })) })),
  };
  S.workouts.push(rec); S.workouts.sort(byDate);
  await db.put('workouts', rec);
  S.active = null; UI.timer = null; await db.kvSet('active', null);
  const prs = prsInWorkout(S.workouts, rec);
  openSheet('summary', { id: rec.id, prs });
  render();
}

function viewSummary({ id, prs }) {
  const w = S.workouts.find((x) => x.id === id);
  const mins = Math.round((w.end - w.t) / 60000);
  const sets = w.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0);
  const vol = Math.round(w.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done).reduce((b, s) => b + s.w * s.r, 0), 0));
  return `<div class="sheet-head"><span></span><div class="center"><b>Workout complete</b></div><button class="icon-btn" data-act="close-sheet">${icon('x')}</button></div>
    <div class="sheet-body"><div class="summary-hero">${icon('check', 'big ok')}<h2>${esc(dayLabel(w.dayId))} done</h2></div>
    <div class="stats3"><div><b>${mins}</b><span>minutes</span></div><div><b>${sets}</b><span>sets</span></div><div><b>${vol.toLocaleString()}</b><span>kg volume</span></div></div>
    ${prs.length ? `<div class="card"><div class="eyebrow">Personal records</div><ul class="plain">${prs.map((p) => `<li>${icon('bolt')} ${esc(p.name)} — ${p.kind === 'weight' ? `${p.value} kg heaviest` : `${p.value} kg est. 1RM`}</li>`).join('')}</ul></div>` : ''}
    <p class="muted">Next time’s weights are already calculated from today’s sets and ratings. Eat a protein-rich meal in the next few hours.</p>
    <button class="btn primary block" data-act="close-sheet">Done</button></div>`;
}

/* ───────────────────────── Exercise detail ───────────────────────── */
function viewExercise({ id }) {
  const e = exMap()[id];
  const h = exerciseHistory(S.workouts, id);
  const pr = personalRecords(h);
  const rec = recommend(e, h, today());
  const st = STATUS[rec.status];
  return `<div class="sheet-head"><span></span><div class="center"><b>${esc(e.name)}</b></div><button class="icon-btn" data-act="close-sheet">${icon('x')}</button></div>
    <div class="sheet-body">
      <div class="card"><div class="row-between"><div class="eyebrow">Next session</div><em class="pill ${st.cls}">${icon(st.icon)}${rec.weight != null ? `${rec.weight} kg` : st.label}</em></div><p>${esc(rec.why)}</p></div>
      ${pr ? `<div class="stats3"><div><b>${pr.heaviest.value}</b><span>heaviest kg</span></div><div><b>${pr.e1rm.value}</b><span>est. 1RM kg</span></div><div><b>${pr.volume.value.toLocaleString()}</b><span>best volume</span></div></div>
      <div class="card"><div class="eyebrow">Estimated 1-rep max</div>${lineChart(h.map((x) => ({ date: x.date, y: r1(x.best) })), { unit: ' kg' })}</div>` : ''}
      <div class="card"><div class="eyebrow">Sessions</div>${h.length ? `<ul class="plain hist">${h.slice().reverse().map((x) => `<li><span>${fmtShort(x.date)}</span><b>${x.sets.map((s) => `${s.w ? `${s.w}×` : ''}${s.r}`).join(' · ')}</b><em>${x.diff ? DIFFICULTY[x.diff].label : ''}${x.pain ? ' · pain' : ''}</em></li>`).join('')}</ul>` : '<p class="muted">No sessions yet.</p>'}</div>
    </div>`;
}

/* ───────────────────────── Meal logging ───────────────────────── */
function mealName(h = hour()) { return h < 11 ? 'Breakfast' : h < 16 ? 'Lunch' : h < 19 ? 'Snack' : 'Dinner'; }

function openMeal(entry) {
  UI.mealDraft = entry
    ? { id: entry.id, date: entry.date, t: entry.t, meal: entry.meal, name: entry.name || '', items: entry.items.map((i) => ({ ...i })), photo: entry.photo || null, q: '', fav: false }
    : { id: null, date: today(), t: Date.now(), meal: mealName(), name: '', items: [], photo: null, q: '', fav: false };
  openSheet('meal', { full: true });
}

function recentFoods() {
  const seen = new Set(), out = [];
  for (let i = S.food.length - 1; i >= 0 && out.length < 10; i--) for (const it of S.food[i].items) {
    if (!seen.has(it.fid)) { seen.add(it.fid); const f = allFoods().find((x) => x.id === it.fid); if (f) out.push({ f, g: it.g }); }
  }
  return out;
}

function viewMeal() {
  const d = UI.mealDraft;
  return `<div class="sheet-head"><button class="icon-btn" data-act="close-sheet">${icon('x')}</button>
      <div class="center"><select class="meal-select" data-in="meal-type">${['Breakfast', 'Lunch', 'Snack', 'Dinner', 'Pre-workout', 'Post-workout'].map((m) => `<option ${m === d.meal ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
      <button class="btn primary sm" data-act="save-meal" ${d.items.length ? '' : 'disabled'}>Save</button></div>
    <div class="sheet-body">
      <div class="search-row"><input id="meal-q" class="big-input" placeholder="Type or dictate: “3 eggs, 200 g rice”" value="${esc(d.q)}" data-in="meal-q" autocomplete="off" autocorrect="off" enterkeyhint="done">
        <label class="icon-btn cam" aria-label="Add photo">${icon('camera')}<input type="file" accept="image/*" data-in="meal-photo" hidden></label></div>
      <p class="muted tiny">Tip: tap the microphone on the iPhone keyboard to dictate. Quantities like “2 eggs”, “150 g chicken”, “a bowl of chorba” are understood.</p>
      <div id="meal-results">${mealResults()}</div></div>`;
}

function mealResults() {
  const d = UI.mealDraft;
  const tot = totals([{ items: d.items }]);
  const q = d.q.trim();
  const parsed = q ? parseFoodText(q, allFoods()) : { items: [], unknown: [] };
  const nq = norm(q);
  const search = nq.length >= 2 ? allFoods().filter((f) => [f.n, ...(f.a || [])].some((a) => norm(a).includes(nq))).slice(0, 8) : [];
  const recent = recentFoods();
  const prevMeals = S.food.filter((e) => e.date !== today()).slice(-30).reverse().filter((e, i, arr) => arr.findIndex((x) => x.items.map((y) => y.fid).join() === e.items.map((y) => y.fid).join()) === i).slice(0, 5);
  const foodById = (id) => allFoods().find((f) => f.id === id);
  return `${d.photo ? `<div class="meal-photo"><img data-photo="${d.photo.id}" alt=""><p class="muted small">Photo saved with this meal. Choose the foods below — a photo alone can’t give exact nutrition values.</p></div>` : ''}
      ${parsed.items.length ? `<div class="group"><div class="eyebrow">Recognised</div>${parsed.items.map((p, i) => `<button class="food-row add" data-act="add-parsed" data-i="${i}"><div><b>${esc(p.food.n)}</b><span>${p.grams} ${p.food.ml ? 'ml' : 'g'} · ${itemFrom(p.food, p.grams).k} kcal · ${itemFrom(p.food, p.grams).p} g P${p.food.est ? ' · estimate' : ''}</span></div>${icon('plus')}</button>`).join('')}
        ${parsed.items.length > 1 ? `<button class="btn ghost block sm" data-act="add-all-parsed">Add all ${parsed.items.length}</button>` : ''}</div>` : ''}
      ${parsed.unknown.length ? `<p class="muted small">Not recognised: ${parsed.unknown.map(esc).join(', ')} — <button class="link inline" data-act="custom-food" data-name="${esc(parsed.unknown[0])}">create a custom food</button></p>` : ''}
      ${search.length ? `<div class="group"><div class="eyebrow">Foods</div>${search.map((f) => `<button class="food-row add" data-act="add-food" data-id="${f.id}"><div><b>${esc(f.n)}</b><span>${f.k} kcal · ${f.p} P · ${f.c} C · ${f.f} F per 100 ${f.ml ? 'ml' : 'g'}${f.est ? ' · estimate' : ''}</span></div>${icon('plus')}</button>`).join('')}</div>` : ''}

      ${d.items.length ? `<div class="group selected"><div class="eyebrow">This meal · ${tot.k} kcal · ${tot.p} P · ${tot.c} C · ${tot.f} F</div>
        ${d.items.map((it, i) => { const f = foodById(it.fid); return `<div class="sel-item"><div class="sel-top"><b>${esc(it.n)}</b><button class="icon-btn sm" data-act="remove-item" data-i="${i}">${icon('x')}</button></div>
          <div class="qty"><button class="icon-btn sm" data-act="qty" data-i="${i}" data-v="-1">${icon('minus')}</button>
            <input inputmode="decimal" value="${it.g}" data-in="item-g" data-i="${i}"><span>${f?.ml ? 'ml' : 'g'}</span>
            <button class="icon-btn sm" data-act="qty" data-i="${i}" data-v="1">${icon('plus')}</button>
            <span class="macro-mini">${it.k} kcal · ${it.p} P</span></div>
          ${f ? `<div class="chips">${(f.u || []).map(([l, g]) => `<button class="chip" data-act="portion" data-i="${i}" data-g="${g}">${esc(l)} ${g}</button>`).join('')}${(f.u || []).slice(0, 1).map(([l, g]) => `<button class="chip" data-act="portion" data-i="${i}" data-g="${g * 2}">2 × ${esc(l)}</button>`).join('')}
            ${f.pair ? `<button class="chip alt" data-act="swap-pair" data-i="${i}">${f.raw ? 'Use cooked weight' : 'Weighed raw?'}</button>` : ''}</div>` : ''}</div>`; }).join('')}
        <label class="switch-row"><input type="checkbox" data-in="meal-fav" ${d.fav ? 'checked' : ''}><span>Save as a favourite meal</span></label>
        ${d.fav ? `<input class="big-input" placeholder="Meal name (e.g. My breakfast)" value="${esc(d.name)}" data-in="meal-name">` : ''}
      </div>` : ''}

      ${!q ? `
        ${S.meals.length ? `<div class="group"><div class="eyebrow">Favourite meals</div>${S.meals.map((m) => `<button class="food-row add" data-act="add-saved" data-id="${m.id}"><div><b>${esc(m.name)}</b><span>${totals([m]).k} kcal · ${totals([m]).p} g P</span></div>${icon('plus')}</button>`).join('')}</div>` : ''}
        ${prevMeals.length ? `<div class="group"><div class="eyebrow">Repeat a previous meal</div>${prevMeals.map((m) => `<button class="food-row add" data-act="repeat-meal" data-id="${m.id}"><div><b>${esc(m.name || m.meal)} · ${fmtShort(m.date)}</b><span>${esc(m.items.map((i) => i.n).join(', '))}</span></div>${icon('repeat')}</button>`).join('')}</div>` : ''}
        ${recent.length ? `<div class="group"><div class="eyebrow">Recent foods</div><div class="chips">${recent.map(({ f, g }) => `<button class="chip" data-act="add-food" data-id="${f.id}" data-g="${g}">${esc(f.n)}</button>`).join('')}</div></div>` : ''}
        <div class="group"><div class="eyebrow">Quick picks</div><div class="chips">${['egg', 'chicken_cooked', 'rice_cooked', 'pasta_cooked', 'baguette', 'kesra', 'tuna_water', 'lben', 'dates', 'banana', 'chorba', 'couscous_dish', 'greek_yogurt', 'whey', 'olive_oil'].map((id) => { const f = foodById(id); return f ? `<button class="chip" data-act="add-food" data-id="${id}">${esc(f.n.split(' (')[0].split(',')[0])}</button>` : ''; }).join('')}</div></div>
      ` : ''}
      <button class="link" data-act="custom-food">${icon('plus')} Create custom food from a label</button>
      ${d.id ? `<button class="btn ghost block danger-text" data-act="delete-meal">Delete this entry</button>` : ''}
      <div class="spacer"></div>`;
}

function addItemToDraft(food, grams) {
  const g = grams || (food.u?.[0]?.[1]) || 100;
  UI.mealDraft.items.push(itemFrom(food, g));
}

async function saveMeal() {
  const d = UI.mealDraft;
  if (!d.items.length) return;
  const entry = { id: d.id || uid(), date: d.date, t: d.t, meal: d.meal, name: d.fav && d.name ? d.name : '', items: d.items, photo: d.photo };
  await db.put('food', entry);
  S.food = S.food.filter((e) => e.id !== entry.id).concat(entry).sort(byDate);
  if (d.fav) {
    const m = { id: uid(), name: d.name || `${d.meal} ${fmtShort(d.date)}`, items: d.items.map((i) => ({ ...i })) };
    await db.put('meals', m); S.meals.push(m);
  }
  UI.mealDraft = null;
  closeSheet();
  toast(`Saved · ${totals([entry]).k} kcal`);
}

function viewCustomFood({ name = '' }) {
  return `<div class="sheet-head"><button class="icon-btn" data-act="back-meal">${icon('back')}</button><div class="center"><b>Custom food</b></div><button class="btn primary sm" data-act="save-custom">Save</button></div>
    <div class="sheet-body"><p class="muted small">Copy the values from the nutrition label. Choose whether they are per 100 g or per serving.</p>
      <label class="field"><span>Name</span><input id="cf-name" value="${esc(name)}"></label>
      <div class="seg wide" id="cf-basis"><button class="on" data-act="cf-basis" data-v="100">Per 100 g</button><button data-act="cf-basis" data-v="serving">Per serving</button></div>
      <label class="field" id="cf-serv-wrap" hidden><span>Serving size (g)</span><input id="cf-serv" inputmode="decimal"></label>
      <div class="grid2"><label class="field"><span>Calories (kcal)</span><input id="cf-k" inputmode="decimal"></label><label class="field"><span>Protein (g)</span><input id="cf-p" inputmode="decimal"></label>
      <label class="field"><span>Carbs (g)</span><input id="cf-c" inputmode="decimal"></label><label class="field"><span>Fat (g)</span><input id="cf-f" inputmode="decimal"></label></div>
      <label class="field"><span>Typical portion (g) · optional</span><input id="cf-u" inputmode="decimal"></label>
    </div>`;
}

async function saveCustomFood() {
  const v = (id) => parseFloat(($(`#${id}`)?.value || '').replace(',', '.'));
  const name = $('#cf-name').value.trim();
  const basis = $('#cf-basis .on').dataset.v;
  const serv = v('cf-serv');
  const m = basis === 'serving' ? 100 / serv : 1;
  if (!name || !(v('cf-k') >= 0) || (basis === 'serving' && !(serv > 0))) return toast('Fill in the name, calories and serving size.');
  const f = { id: 'c_' + uid(), n: name, a: [name], k: Math.round(v('cf-k') * m), p: r1((v('cf-p') || 0) * m), c: r1((v('cf-c') || 0) * m), f: r1((v('cf-f') || 0) * m), u: v('cf-u') > 0 ? [['portion', v('cf-u')]] : basis === 'serving' ? [['serving', serv]] : [], custom: true };
  await db.put('customFoods', f); S.customFoods.push(f);
  if (UI.mealDraft) { addItemToDraft(f); UI.mealDraft.q = ''; openSheet('meal', { full: true }); }
  else closeSheet();
  toast('Custom food saved');
}

/* ───────────────────────── Photos & body ───────────────────────── */
async function resizeImage(file, max) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85));
  } finally { URL.revokeObjectURL(url); }
}

async function savePhoto(file, meta) {
  const blob = await resizeImage(file, 1600);
  const thumb = await resizeImage(file, 400);
  const p = { id: uid(), date: meta.date || today(), kind: meta.kind || 'progress', pose: meta.pose || 'front', note: meta.note || '', blob, thumb };
  await db.put('photos', p);
  S.photos.push(p); S.photos.sort(byDate);
  return p;
}

async function addBody(entry) {
  const existing = S.body.find((b) => b.date === entry.date);
  const e = existing ? { ...existing, ...Object.fromEntries(Object.entries(entry).filter(([, v]) => v != null && v !== '')) } : { id: uid(), ...entry };
  await db.put('body', e);
  S.body = S.body.filter((b) => b.id !== e.id).concat(e).sort(byDate);
}

function viewCheckin() {
  const last = S.body.at(-1) || {};
  const M = [['waist', 'Waist'], ['chest', 'Chest'], ['arm', 'Arm'], ['shoulder', 'Shoulders'], ['thigh', 'Thigh']];
  const todays = S.photos.filter((p) => p.date === today() && p.kind === 'progress');
  return `<div class="sheet-head"><button class="icon-btn" data-act="close-sheet">${icon('x')}</button><div class="center"><b>Progress check-in</b></div><button class="btn primary sm" data-act="save-checkin">Save</button></div>
    <div class="sheet-body">
      <label class="field"><span>Morning weight (kg)</span><input id="ci-weight" class="big-input" inputmode="decimal" placeholder="${last.weight || ''}"></label>
      <div class="eyebrow">Photos</div>
      <div class="pose-row">${['front', 'side', 'back'].map((pose) => { const p = todays.find((x) => x.pose === pose); return `<label class="pose ${p ? 'has' : ''}">${p ? `<img data-photo="${p.id}" alt="">` : icon('camera')}<span>${pose}</span><input type="file" accept="image/*" data-in="checkin-photo" data-pose="${pose}" hidden></label>`; }).join('')}</div>
      <div class="card hint small"><b>For comparable photos:</b> same place and light, phone at chest height ~2 m away, relaxed and flexed poses, same time of day — ideally in the morning before training (no pump).</div>
      <details ${M.some(([k]) => last[k]) ? 'open' : ''}><summary class="eyebrow">Measurements (cm) · optional</summary>
        <div class="grid2">${M.map(([k, l]) => `<label class="field"><span>${l}</span><input id="ci-${k}" inputmode="decimal" placeholder="${last[k] || ''}"></label>`).join('')}</div>
        <p class="muted tiny">Waist: at the navel, relaxed, after breathing out. Arm: flexed, widest point. Thigh: midway hip–knee.</p></details>
    </div>`;
}

async function saveCheckin() {
  const v = (id) => { const x = parseFloat(($(`#${id}`)?.value || '').replace(',', '.')); return x > 0 ? x : null; };
  const e = { date: today(), weight: v('ci-weight'), waist: v('ci-waist'), chest: v('ci-chest'), arm: v('ci-arm'), shoulder: v('ci-shoulder'), thigh: v('ci-thigh') };
  if (Object.values(e).slice(1).some((x) => x != null)) await addBody(e);
  closeSheet(); toast('Check-in saved');
}

function viewCompare({ a, b }) {
  const prog = S.photos.filter((p) => p.kind === 'progress');
  const A = prog.find((p) => p.id === a) || prog[0];
  const B = prog.find((p) => p.id === b) || prog.at(-1);
  const opt = (sel) => prog.map((p) => `<option value="${p.id}" ${p.id === sel?.id ? 'selected' : ''}>${fmtShort(p.date)} ${p.date.slice(0, 4)} · ${p.pose}${p.note ? ` · ${esc(p.note)}` : ''}</option>`).join('');
  const wAt = (d) => weights(S.body).filter((x) => x.date <= d).at(-1)?.weight;
  return `<div class="sheet-head"><span></span><div class="center"><b>Compare</b></div><button class="icon-btn" data-act="close-sheet">${icon('x')}</button></div>
    <div class="sheet-body"><div class="compare">
      ${[A, B].map((p, i) => `<div><select data-in="cmp" data-side="${i ? 'b' : 'a'}">${opt(p)}</select>${p ? `<img data-photo="${p.id}" data-full="1" alt=""><span>${fmtShort(p.date)}${wAt(p.date) ? ` · ${wAt(p.date)} kg` : ''}</span>` : ''}</div>`).join('')}
    </div>
    <p class="muted small">Photos show change better than any number, but lighting, pump and posture matter a lot. Compare like with like. Body-fat or muscle mass can’t be measured from photos, so the app doesn’t estimate them.</p>
    ${B ? `<button class="btn ghost block danger-text" data-act="delete-photo" data-id="${B.id}">Delete right photo</button>` : ''}</div>`;
}

/* ───────────────────────── PROGRESS ───────────────────────── */
function viewProgress() {
  const ctx = buildContext(S, today(), hour());
  const { goal } = ctx;
  const { adv, w, strength } = coachAnswers(ctx);
  const ws = weights(S.body);
  const prog = S.photos.filter((p) => p.kind === 'progress');
  const map = exMap();
  const trackable = Object.values(map).filter((e) => e.equip !== 'bodyweight' && exerciseHistory(S.workouts, e.id).length >= 1);
  const exId = UI.progressEx && map[UI.progressEx] ? UI.progressEx : trackable[0]?.id;
  const meas = ['waist', 'chest', 'arm', 'shoulder', 'thigh'].filter((k) => S.body.some((b) => b[k] > 0));
  const days14 = Array.from({ length: 14 }, (_, i) => addDays(today(), i - 13));
  const dt = Object.fromEntries(dailyTotals(S.food, days14[0], today()).map((d) => [d.date, d]));
  const reports = Array.from({ length: 4 }, (_, i) => weeklyReport(S, addDays(weekStart(today()), -7 * i), today())).filter((r) => r.ws >= weekStart(S.state.startDate || today()));
  const planEnd = addMonths(S.state.startDate || today(), S.profile.planMonths || 8);
  const kgLeft = r1(Math.max(0, goal.target - goal.current));

  return `<header class="top"><div><div class="date">Goal · ${goal.target} kg</div><h1>Progress</h1></div>
      <button class="icon-btn" data-act="open-checkin" aria-label="Check-in">${icon('camera')}</button></header>
    <div class="card hero">
      <div class="hero-nums"><div><b>${r1(goal.current)}</b><span>kg now</span></div><div><b>${kgLeft}</b><span>kg to go</span></div><div><b>${goal.rate != null ? (goal.rate > 0 ? '+' : '') + goal.rate.toFixed(2) : '—'}</b><span>kg / week</span></div></div>
      ${bar(goal.progress, 1, 'goal lg')}
      <div class="ms">${goal.milestones.map((m) => `<div class="m ${m.reached ? 'on' : ''}"><i></i><b>${m.kg}</b><span>${m.reached ? 'done' : m.eta ? fmtShort(m.eta) : '—'}</span></div>`).join('')}</div>
      <p class="small">${goal.eta ? `Projected: <b>${goal.target} kg around ${fmtMonthYear(goal.eta)}</b> at your current rate.` : 'A projected date appears once you have about 2 weeks of weigh-ins.'} Plan: ${fmtMonthYear(planEnd)} (${S.profile.planMonths || 8} months, adjustable).</p>
      <p class="muted small">${esc(w.text)} Total weight is not the same as muscle — waist, strength and photos tell the rest.</p>
    </div>
    <div class="card"><div class="row-between"><div class="eyebrow">Body weight</div><button class="link" data-act="quick-weight">${icon('plus')} Add</button></div>
      ${lineChart(ws.map((x) => ({ date: x.date, y: x.weight })), { target: goal.target, unit: ' kg', empty: 'Log your weight a few times to see the trend.' })}</div>
    <div class="card"><div class="eyebrow">Calories</div><p>${esc(calorieAdviceText(adv))}</p>
      ${adv.change ? `<button class="btn primary block" data-act="apply-adjust" data-v="${adv.change}">Apply ${adv.change > 0 ? '+' : ''}${adv.change} kcal → ${S.targets.kcal + adv.change} kcal</button>` : ''}
      <p class="muted tiny">Targets: ${S.targets.kcal} kcal · ${S.targets.protein} P · ${S.targets.carbs} C · ${S.targets.fat} F. Changes are only suggested with ≥2 weeks of data and never applied without you.</p></div>
    <div class="card"><div class="row-between"><div class="eyebrow">Photos</div><div>${prog.length >= 2 ? `<button class="link" data-act="open-compare">Compare</button>` : ''}<label class="link">${icon('plus')} Add<input type="file" accept="image/*" data-in="progress-photo" hidden></label></div></div>
      ${prog.length ? `<div class="photo-grid">${prog.slice().reverse().map((p) => `<button data-act="open-compare" data-b="${p.id}"><img data-photo="${p.id}" alt=""><span>${fmtShort(p.date)}${p.note ? ' · ' + esc(p.note) : ''}</span></button>`).join('')}</div>` : '<p class="muted">Add your starting photos — front, side and back.</p>'}</div>
    <div class="card"><div class="eyebrow">Strength</div><p class="small">${esc(strength.text)}</p>
      ${trackable.length ? `<select class="inline-select" data-in="progress-ex">${trackable.map((e) => `<option value="${e.id}" ${e.id === exId ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select>
      ${lineChart(exerciseHistory(S.workouts, exId).map((x) => ({ date: x.date, y: r1(x.best) })), { unit: ' kg', empty: 'Needs two sessions of this exercise.' })}
      <p class="muted tiny">Estimated 1-rep max (Epley) from your best set — a fair way to compare sets with different reps.</p>` : ''}</div>
    ${meas.length ? `<div class="card"><div class="eyebrow">Measurements (cm)</div><div class="meas">${meas.map((k) => { const pts = S.body.filter((b) => b[k] > 0); const f = pts[0][k], l = pts.at(-1)[k]; return `<div><span>${k}</span><b>${r1(l)}</b><em class="${l - f > 0 ? 'pos' : l - f < 0 ? 'neg' : ''}">${l - f > 0 ? '+' : ''}${r1(l - f)}</em></div>`; }).join('')}</div>
      ${S.body.filter((b) => b.waist > 0).length >= 2 ? `<div class="eyebrow">Waist</div>${lineChart(S.body.filter((b) => b.waist > 0).map((b) => ({ date: b.date, y: b.waist })), { unit: ' cm' })}<p class="muted tiny">If waist rises much faster than ~1 cm per 2–3 kg gained, the gain is getting less lean.</p>` : ''}</div>` : ''}
    <div class="card"><div class="eyebrow">Nutrition · last 14 days</div>
      ${barChart(days14.map((d) => ({ label: d.slice(8), v: dt[d]?.k || 0, hit: dt[d] && dt[d].p >= S.targets.protein * 0.9 })), S.targets.kcal)}
      <p class="muted tiny">Bars: calories vs target line. Highlighted: protein target reached.</p></div>
    <div class="card"><div class="eyebrow">Weekly reports</div>${reports.length ? reports.map((r) => `<div class="report"><b>${r.title}</b><ul class="plain">${r.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>`).join('') : '<p class="muted">Your first report appears after the first week.</p>'}
      <button class="link" data-act="open-coach">${icon('spark')} Ask the coach</button></div>
    <div class="spacer"></div>`;
}

/* ───────────────────────── Coach & references ───────────────────────── */
function viewCoach() {
  const ctx = buildContext(S, today(), hour());
  const { qa } = coachAnswers(ctx);
  const rep = weeklyReport(S, weekStart(today()), today());
  return `<div class="sheet-head"><span></span><div class="center"><b>Coach</b></div><button class="icon-btn" data-act="close-sheet">${icon('x')}</button></div>
    <div class="sheet-body">
      <p class="muted small">Answers are calculated only from what you have logged. When data is missing, I say so.</p>
      ${qa.map((x) => `<div class="qa"><b>${esc(x.q)}</b><p>${esc(x.a)}</p></div>`).join('')}
      <div class="card"><div class="eyebrow">This week so far</div><ul class="plain">${rep.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>
      <button class="btn ghost block" data-act="open-refs">${icon('book')} The science behind the advice</button>
      <div class="spacer"></div></div>`;
}

function viewRefs() {
  const R = [
    ['Progressive overload', 'Weight goes up only after every set reaches the top of the rep range with reps in reserve, by the smallest step available. Being stuck at the bottom twice in a row lowers the load ~8%.', 'American College of Sports Medicine (2009). Progression models in resistance training for healthy adults. Med Sci Sports Exerc 41(3):687–708.'],
    ['Reps in reserve (RIR)', 'Easy ≈ 4+ reps left, Good ≈ 2–3, Hard ≈ 1, Too hard ≈ 0. Training roughly 0–3 reps from failure builds muscle well without needing failure every set.', 'Zourdos MC et al. (2016). Novel resistance training–specific RPE scale measuring repetitions in reserve. J Strength Cond Res 30(1):267–275. · Refalo MC et al. (2023). Influence of resistance training proximity-to-failure on skeletal muscle hypertrophy: a systematic review with meta-analysis. Sports Med 53(3):649–665.'],
    ['Rep ranges & load', 'Sets of ~6–30 reps produce similar hypertrophy when taken close to failure; your 12–15 rep programme sits well inside this.', 'Schoenfeld BJ et al. (2017). Strength and hypertrophy adaptations between low- vs. high-load resistance training. J Strength Cond Res 31(12):3508–3523.'],
    ['Training volume', 'More weekly sets per muscle tend to give more growth, with ~10+ sets per muscle per week a good target. The Training tab counts them.', 'Schoenfeld BJ, Ogborn D, Krieger JW (2017). Dose-response relationship between weekly resistance training volume and increases in muscle mass. J Sports Sci 35(11):1073–1082.'],
    ['Protein', '~1.6 g/kg/day captures most of the benefit, up to ~2.2 g/kg for those wanting to maximise it, spread over 3–5 meals. 160 g ≈ 2.1 g/kg for you.', 'Morton RW et al. (2018). A systematic review, meta-analysis and meta-regression of the effect of protein supplementation on resistance training-induced gains. Br J Sports Med 52(6):376–384. · Jäger R et al. (2017). ISSN position stand: protein and exercise. J Int Soc Sports Nutr 14:20.'],
    ['Creatine', '3–5 g of creatine monohydrate daily is safe and effective; timing matters little — consistency does. Expect 1–2 kg of water weight in the first weeks.', 'Kreider RB et al. (2017). ISSN position stand: safety and efficacy of creatine supplementation in exercise, sport, and medicine. J Int Soc Sports Nutr 14:18.'],
    ['Rate of weight gain', 'A small surplus and roughly 0.25–0.5% of body weight per week (slower for leaner gains) limits fat gain. The app uses 0.10–0.30 kg/week as your lean range and changes calories by only 100–150 kcal after ≥2 weeks of data.', 'Iraki J et al. (2019). Nutrition recommendations for bodybuilders in the off-season: a narrative review. Sports 7(7):154.'],
    ['Sleep & recovery', 'Adults aged 18–25 are recommended 7–9 hours. Short sleep impairs recovery and body composition.', 'Hirshkowitz M et al. (2015). National Sleep Foundation’s sleep time duration recommendations. Sleep Health 1(1):40–43.'],
    ['Carbohydrates', 'Carbs don’t cause fat gain on their own; total energy balance does. Carbs fuel training volume. Calorie changes are split ~70% carbs, 30% fat, keeping protein fixed.', 'Iraki J et al. (2019), above; ACSM/AND/DC (2016) Nutrition and athletic performance. Med Sci Sports Exerc 48(3):543–568.'],
  ];
  return `<div class="sheet-head"><button class="icon-btn" data-act="open-coach">${icon('back')}</button><div class="center"><b>The science</b></div><button class="icon-btn" data-act="close-sheet">${icon('x')}</button></div>
    <div class="sheet-body">${R.map(([t, d, ref]) => `<div class="ref"><b>${t}</b><p>${d}</p><p class="cite">${ref}</p></div>`).join('')}
    <p class="muted tiny">This app gives general, evidence-based training and nutrition guidance — not medical advice. See a professional for pain, injury or health conditions.</p><div class="spacer"></div></div>`;
}

/* ───────────────────────── Settings & programme editor ───────────────────────── */
function viewSettings() {
  const p = S.profile, t = S.targets;
  const calc = macroKcal(t);
  const field = (id, label, val, mode = 'decimal') => `<label class="field"><span>${label}</span><input id="${id}" inputmode="${mode}" value="${val ?? ''}"></label>`;
  return `<div class="sheet-head"><button class="icon-btn" data-act="close-sheet">${icon('x')}</button><div class="center"><b>Settings</b></div><button class="btn primary sm" data-act="save-settings">Save</button></div>
    <div class="sheet-body">
      <div class="eyebrow">Profile</div>
      <div class="grid2">${field('s-name', 'First name', esc(p.name), 'text')}${field('s-age', 'Age', p.age, 'numeric')}${field('s-height', 'Height (cm)', p.height)}${field('s-start', 'Start weight (kg)', p.startWeight)}
      ${field('s-target', 'Target weight (kg)', p.targetWeight)}${field('s-months', 'Plan length (months)', p.planMonths || 8, 'numeric')}${field('s-creat', 'Creatine (g/day)', p.creatine || 5)}
      <label class="field"><span>Start date</span><input id="s-startdate" type="date" value="${S.state.startDate || ''}"></label></div>
      <div class="eyebrow">Daily targets</div>
      <div class="grid2">${field('s-kcal', 'Calories', t.kcal, 'numeric')}${field('s-p', 'Protein (g)', t.protein, 'numeric')}${field('s-c', 'Carbs (g)', t.carbs, 'numeric')}${field('s-f', 'Fat (g)', t.fat, 'numeric')}</div>
      <p class="muted tiny">Macros add up to ${calc} kcal${Math.abs(calc - t.kcal) > 50 ? ' — different from your calorie target; the coach uses the calorie target.' : '.'} These are provisional starting targets; the coach suggests changes from your trend.</p>
      <div class="eyebrow">Training days</div>
      <div class="chips wd">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<button class="chip ${S.program.trainingDays.includes(d) ? 'on' : ''}" data-act="toggle-wd" data-v="${d}">${dayName(d).slice(0, 3)}</button>`).join('')}</div>
      <p class="muted tiny">Rotation: ${S.program.rotation.map(dayLabel).join(' → ')}. Missed sessions are caught up on the next free day — the rotation never skips a workout.</p>
      <div class="eyebrow">Preferences</div>
      <label class="switch-row"><input type="checkbox" id="s-rest" ${S.settings.restTimer ? 'checked' : ''}><span>Automatic rest timer</span></label>
      <label class="field"><span>Photo & measurement check-in</span><select id="s-interval"><option value="7" ${S.settings.checkInterval == 7 ? 'selected' : ''}>Every 7 days</option><option value="15" ${S.settings.checkInterval == 15 ? 'selected' : ''}>Every 15 days</option></select></label>
      <label class="field"><span>Appearance</span><select id="s-theme">${['system', 'light', 'dark'].map((x) => `<option ${S.settings.theme === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <button class="btn ghost block" data-act="open-program">${icon('edit')} Edit training programme</button>
      <div class="eyebrow">Your data</div>
      <p class="muted tiny">Everything is stored only on this iPhone. Make a backup every few weeks and keep it in Files or iCloud Drive.${S.state.lastBackup ? ` Last backup: ${fmtShort(S.state.lastBackup)}.` : ''}</p>
      <button class="btn ghost block" data-act="backup">Back up everything</button>
      <label class="btn ghost block">Restore backup / import setup<input type="file" accept="application/json,.json" data-in="import-file" hidden></label>
      <p class="muted tiny" id="storage-info"></p>
      <button class="btn ghost block" data-act="open-refs">${icon('book')} The science behind the advice</button>
      <button class="btn ghost block danger-text" data-act="reset-all">Erase all data</button>
      <p class="muted tiny center-text">Coach v${APP_VERSION}</p><div class="spacer"></div>
    </div>`;
}

async function saveSettings() {
  const n = (id) => { const x = parseFloat(($(`#${id}`)?.value || '').replace(',', '.')); return Number.isFinite(x) ? x : null; };
  Object.assign(S.profile, { name: $('#s-name').value.trim(), age: n('s-age'), height: n('s-height'), startWeight: n('s-start') || S.profile.startWeight, targetWeight: n('s-target') || S.profile.targetWeight, planMonths: n('s-months') || 8, creatine: n('s-creat') || 5 });
  Object.assign(S.targets, { kcal: n('s-kcal') || S.targets.kcal, protein: n('s-p') ?? S.targets.protein, carbs: n('s-c') ?? S.targets.carbs, fat: n('s-f') ?? S.targets.fat });
  Object.assign(S.settings, { restTimer: $('#s-rest').checked, checkInterval: +$('#s-interval').value, theme: $('#s-theme').value });
  if ($('#s-startdate').value) S.state.startDate = $('#s-startdate').value;
  await Promise.all(['profile', 'targets', 'settings', 'state', 'program'].map(saveKV));
  closeSheet(); toast('Saved');
}

function viewProgram() {
  const id = UI.editDay;
  const day = S.program.days[id];
  return `<div class="sheet-head"><button class="icon-btn" data-act="close-sheet">${icon('x')}</button><div class="center"><b>Programme</b></div><span></span></div>
    <div class="sheet-body">
      <div class="seg wide">${S.program.rotation.map((d) => `<button class="${d === id ? 'on' : ''}" data-act="edit-day" data-v="${d}">${esc(dayLabel(d))}</button>`).join('')}</div>
      <p class="muted tiny">Edits apply from the next workout. History is kept for every exercise, even removed ones.</p>
      ${day.exercises.map((e, i) => `<div class="prog-ex"><div class="prog-top"><input value="${esc(e.name)}" data-in="pe-name" data-i="${i}" class="name-input">
          <button class="icon-btn sm" data-act="pe-move" data-i="${i}" data-v="-1" ${i ? '' : 'disabled'}>${icon('up')}</button>
          <button class="icon-btn sm" data-act="pe-move" data-i="${i}" data-v="1" ${i < day.exercises.length - 1 ? '' : 'disabled'}>${icon('down')}</button>
          <button class="icon-btn sm" data-act="pe-remove" data-i="${i}">${icon('trash')}</button></div>
        <div class="prog-grid">
          <label><span>Sets</span><input value="${e.sets.join('-')}" data-in="pe-sets" data-i="${i}" inputmode="text"></label>
          <label><span>Reps</span><input value="${e.reps[0] === e.reps[1] ? e.reps[0] : e.reps.join('-')}" data-in="pe-reps" data-i="${i}" inputmode="text"></label>
          <label><span>Step kg</span><input value="${e.inc}" data-in="pe-inc" data-i="${i}" inputmode="decimal"></label>
          <label><span>Rest s</span><input value="${e.rest}" data-in="pe-rest" data-i="${i}" inputmode="numeric"></label>
          <label class="span2"><span>Equipment</span><select data-in="pe-equip" data-i="${i}">${Object.entries(EQUIP).map(([k, v]) => `<option value="${k}" ${k === e.equip ? 'selected' : ''}>${v.label} (${v.unit})</option>`).join('')}</select></label>
        </div></div>`).join('')}
      <button class="btn ghost block" data-act="pe-add">${icon('plus')} Add exercise</button>
      <div class="grid2"><label class="field"><span>Warm-up</span><input value="${esc(day.warmup.join(' | '))}" data-in="pe-warmup"></label><label class="field"><span>Finisher</span><input value="${esc(day.finisher)}" data-in="pe-finisher"></label></div>
      <button class="link" data-act="pe-reset">Restore the original programme</button>
      <div class="spacer"></div></div>`;
}

const parseRange = (s) => { const m = String(s).match(/(\d+)\s*(?:[-–x]\s*(\d+))?/); if (!m) return null; const a = +m[1], b = m[2] ? +m[2] : a; return [Math.min(a, b), Math.max(a, b)]; };

/* ───────────────────────── Events ───────────────────────── */
const SHEETS = { workout: viewWorkout, summary: viewSummary, exercise: viewExercise, meal: viewMeal, custom: viewCustomFood, checkin: viewCheckin, compare: viewCompare, coach: viewCoach, refs: viewRefs, settings: viewSettings, program: viewProgram };

async function setDay(patch) {
  const d = { date: today(), ...(S.days[today()] || {}), ...patch };
  S.days[today()] = d; await db.put('days', d); render();
}

const actions = {
  'tab': (el) => { UI.tab = el.dataset.tab; main.scrollTop = 0; render(); },
  'close-sheet': () => closeSheet(),
  'onb-save': () => onboardSave(),
  'open-settings': () => openSheet('settings', { full: true }),
  'open-coach': () => openSheet('coach', { full: true }),
  'open-refs': () => openSheet('refs', { full: true }),
  'open-program': () => openSheet('program', { full: true }),
  'open-checkin': () => openSheet('checkin', { full: true }),
  'open-compare': (el) => openSheet('compare', { full: true, b: el.dataset.b }),
  'open-exercise': (el) => openSheet('exercise', { full: true, id: el.dataset.id }),
  'start-workout': (el) => startWorkout(el.dataset.day),
  'resume-workout': () => openSheet('workout', { full: true }),
  'toggle-creatine': () => setDay({ creatine: !S.days[today()]?.creatine }),
  'set-sleep': (el) => setDay({ sleep: S.days[today()]?.sleep === +el.dataset.v ? null : +el.dataset.v }),
  'set-energy': (el) => setDay({ energy: S.days[today()]?.energy === +el.dataset.v ? null : +el.dataset.v }),
  'quick-weight': async () => {
    const last = weights(S.body).at(-1);
    const v = prompt('Morning weight (kg)', last ? last.weight : '');
    const x = parseFloat(String(v || '').replace(',', '.'));
    if (x > 30 && x < 250) { await addBody({ date: today(), weight: x }); render(); toast(`${x} kg saved`); }
  },
  // workout
  'toggle-set': async (el) => {
    const e = S.active.exercises[+el.dataset.i], s = e.sets[+el.dataset.j];
    s.done = !s.done;
    if (s.done && !(+s.r > 0)) { s.done = false; return toast('Enter the reps first.'); }
    if (s.done) startRest(exMap()[e.exId]?.rest || 90);
    await saveKV('active'); renderSheet();
  },
  'add-set': async (el) => { const e = S.active.exercises[+el.dataset.i]; const l = e.sets.at(-1) || { w: '', r: '' }; e.sets.push({ w: l.w, r: l.r, done: false }); await saveKV('active'); renderSheet(); },
  'remove-set': async (el) => { S.active.exercises[+el.dataset.i].sets.pop(); await saveKV('active'); renderSheet(); },
  'skip': async (el) => { S.active.exercises[+el.dataset.i].skipped = true; await saveKV('active'); renderSheet(); },
  'unskip': async (el) => { S.active.exercises[+el.dataset.i].skipped = false; await saveKV('active'); renderSheet(); },
  'toggle-pain': async (el) => { const e = S.active.exercises[+el.dataset.i]; e.pain = !e.pain; await saveKV('active'); renderSheet(); },
  'set-diff': async (el) => { S.active.exercises[+el.dataset.i].diff = el.dataset.v; await saveKV('active'); renderSheet(); },
  'rest-add': () => { if (UI.timer) { UI.timer.end += 15000; UI.timer.beeped = false; renderSheet(); } },
  'rest-skip': () => { UI.timer = null; renderSheet(); },
  'finish-workout': () => finishWorkout(),
  'discard-workout': async () => { if (!confirm('Discard this workout? Nothing from it will be saved.')) return; S.active = null; UI.timer = null; await db.kvSet('active', null); closeSheet(); },
  // meals
  'add-meal': () => openMeal(null),
  'edit-meal': (el) => openMeal(S.food.find((e) => e.id === el.dataset.id)),
  'log-suggestion': (el) => {
    const ctx = buildContext(S, today(), hour());
    const s = suggestMeals(ctx.rem, MEAL_TEMPLATES, allFoods(), hour(), 2)[+el.dataset.i];
    openMeal(null); UI.mealDraft.items = s.items.map((i) => ({ ...i })); renderSheet();
  },
  'add-food': (el) => { const f = allFoods().find((x) => x.id === el.dataset.id); addItemToDraft(f, +el.dataset.g || null); UI.mealDraft.q = ''; renderSheet(); },
  'add-parsed': (el) => { const p = parseFoodText(UI.mealDraft.q, allFoods()).items[+el.dataset.i]; addItemToDraft(p.food, p.grams); renderSheet(); },
  'add-all-parsed': () => { for (const p of parseFoodText(UI.mealDraft.q, allFoods()).items) addItemToDraft(p.food, p.grams); UI.mealDraft.q = ''; renderSheet(); },
  'add-saved': (el) => { const m = S.meals.find((x) => x.id === el.dataset.id); UI.mealDraft.items.push(...m.items.map((i) => ({ ...i }))); if (!UI.mealDraft.name) UI.mealDraft.name = m.name; renderSheet(); },
  'repeat-meal': (el) => { const m = S.food.find((x) => x.id === el.dataset.id); UI.mealDraft.items.push(...m.items.map((i) => ({ ...i }))); renderSheet(); },
  'remove-item': (el) => { UI.mealDraft.items.splice(+el.dataset.i, 1); renderSheet(); },
  'qty': (el) => { const it = UI.mealDraft.items[+el.dataset.i]; const f = allFoods().find((x) => x.id === it.fid); const step = it.g >= 100 ? 25 : 10; const g = Math.max(5, it.g + step * +el.dataset.v); UI.mealDraft.items[+el.dataset.i] = f ? itemFrom(f, g) : it; renderSheet(); },
  'portion': (el) => { const i = +el.dataset.i; const f = allFoods().find((x) => x.id === UI.mealDraft.items[i].fid); UI.mealDraft.items[i] = itemFrom(f, +el.dataset.g); renderSheet(); },
  'swap-pair': (el) => { const i = +el.dataset.i; const f = allFoods().find((x) => x.id === UI.mealDraft.items[i].fid); const p = allFoods().find((x) => x.id === f.pair); UI.mealDraft.items[i] = itemFrom(p, UI.mealDraft.items[i].g); renderSheet(); },
  'save-meal': () => saveMeal(),
  'delete-meal': async () => { if (!confirm('Delete this meal entry?')) return; await db.del('food', UI.mealDraft.id); S.food = S.food.filter((e) => e.id !== UI.mealDraft.id); UI.mealDraft = null; closeSheet(); },
  'custom-food': (el) => openSheet('custom', { full: true, name: el.dataset.name || '' }),
  'back-meal': () => (UI.mealDraft ? openSheet('meal', { full: true }) : closeSheet()),
  'cf-basis': (el) => { el.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === el)); $('#cf-serv-wrap').hidden = el.dataset.v !== 'serving'; },
  'save-custom': () => saveCustomFood(),
  // progress
  'save-checkin': () => saveCheckin(),
  'delete-photo': async (el) => { if (!confirm('Delete this photo permanently from this iPhone? It can’t be recovered unless it is in a backup.')) return; await db.del('photos', el.dataset.id); S.photos = S.photos.filter((p) => p.id !== el.dataset.id); closeSheet(); },
  'apply-adjust': async (el) => {
    const c = +el.dataset.v;
    if (!confirm(`Change your daily target by ${c > 0 ? '+' : ''}${c} kcal (${S.targets.kcal} → ${S.targets.kcal + c})? Protein stays the same; carbs and fat adjust.`)) return;
    S.targets = applyCalorieChange(S.targets, c); S.state.lastAdjust = today();
    S.state.adjustments = [...(S.state.adjustments || []), { date: today(), change: c }];
    await saveKV('targets'); await saveKV('state'); render(); toast('Targets updated');
  },
  // settings
  'save-settings': () => saveSettings(),
  'toggle-wd': (el) => { const v = +el.dataset.v; const t = S.program.trainingDays; S.program.trainingDays = t.includes(v) ? t.filter((x) => x !== v) : [...t, v].sort(); el.classList.toggle('on'); },
  'backup': async () => {
    toast('Preparing backup…');
    const data = await exportAll();
    const r = await shareJSON(data, `coach-backup-${today()}.json`);
    if (r !== 'cancelled') { S.state.lastBackup = today(); await saveKV('state'); }
  },
  'reset-all': async () => {
    if (!confirm('Erase ALL data on this iPhone — workouts, meals, photos, profile? This cannot be undone. Make a backup first.')) return;
    if (prompt('Type ERASE to confirm') !== 'ERASE') return;
    for (const s of db.STORES) await db.clear(s);
    location.reload();
  },
  // programme editor
  'edit-day': (el) => { UI.editDay = el.dataset.v; renderSheet(); },
  'pe-move': async (el) => { const ex = S.program.days[UI.editDay].exercises; const i = +el.dataset.i, j = i + +el.dataset.v; [ex[i], ex[j]] = [ex[j], ex[i]]; await saveKV('program'); renderSheet(); },
  'pe-remove': async (el) => {
    const ex = S.program.days[UI.editDay].exercises; const e = ex[+el.dataset.i];
    if (!confirm(`Remove “${e.name}” from ${dayLabel(UI.editDay)}? Its history stays saved.`)) return;
    S.program.archived = [...(S.program.archived || []).filter((x) => x.id !== e.id), e];
    ex.splice(+el.dataset.i, 1); await saveKV('program'); renderSheet();
  },
  'pe-add': async () => {
    const name = prompt('Exercise name'); if (!name) return;
    const prev = (S.program.archived || []).find((x) => norm(x.name) === norm(name));
    const e = prev ? { ...prev } : { id: 'x_' + uid(), name, equip: 'machine', sets: [2, 3], reps: [10, 12], muscles: [], inc: 2.5, rest: 90 };
    if (prev) S.program.archived = S.program.archived.filter((x) => x.id !== prev.id);
    S.program.days[UI.editDay].exercises.push(e); await saveKV('program'); renderSheet();
  },
  'pe-reset': async () => {
    if (!confirm('Restore the original programme? Your history is kept; custom exercises are archived.')) return;
    const cur = Object.values(S.program.days).flatMap((d) => d.exercises);
    const fresh = cloneProgram(DEFAULT_PROGRAM);
    const ids = new Set(Object.values(fresh.days).flatMap((d) => d.exercises.map((e) => e.id)));
    fresh.archived = [...(S.program.archived || []), ...cur.filter((e) => !ids.has(e.id))];
    fresh.trainingDays = S.program.trainingDays;
    S.program = fresh; await saveKV('program'); renderSheet();
  },
};

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.act];
  if (fn) { ev.preventDefault(); fn(el); }
});

let qTimer;
const inputs = {
  'set-w': (el) => { S.active.exercises[+el.dataset.i].sets[+el.dataset.j].w = el.value.replace(',', '.'); saveKV('active'); },
  'set-r': (el) => { S.active.exercises[+el.dataset.i].sets[+el.dataset.j].r = el.value; saveKV('active'); },
  'meal-q': (el) => {
    // Only the results update while typing/dictating, so the keyboard never closes.
    UI.mealDraft.q = el.value; clearTimeout(qTimer);
    qTimer = setTimeout(() => { const r = $('#meal-results'); if (r) { r.innerHTML = mealResults(); loadThumbs(r); } }, 250);
  },
  'meal-type': (el) => { UI.mealDraft.meal = el.value; },
  'meal-name': (el) => { UI.mealDraft.name = el.value; },
  'item-g': (el) => { const i = +el.dataset.i; const it = UI.mealDraft.items[i]; const f = allFoods().find((x) => x.id === it.fid); const g = parseFloat(el.value.replace(',', '.')); if (f && g > 0) UI.mealDraft.items[i] = itemFrom(f, g); },
  'progress-ex': (el) => { UI.progressEx = el.value; render(); },
  'cmp': (el) => { UI.sheet[el.dataset.side] = el.value; renderSheet(); },
  'pe-name': (el) => { S.program.days[UI.editDay].exercises[+el.dataset.i].name = el.value; saveKV('program'); },
  'pe-sets': (el) => { const r = parseRange(el.value); if (r) { S.program.days[UI.editDay].exercises[+el.dataset.i].sets = r; saveKV('program'); } },
  'pe-reps': (el) => { const r = parseRange(el.value); if (r) { S.program.days[UI.editDay].exercises[+el.dataset.i].reps = r; saveKV('program'); } },
  'pe-inc': (el) => { const v = parseFloat(el.value.replace(',', '.')); if (v >= 0) { S.program.days[UI.editDay].exercises[+el.dataset.i].inc = v; saveKV('program'); } },
  'pe-rest': (el) => { const v = parseInt(el.value, 10); if (v >= 0) { S.program.days[UI.editDay].exercises[+el.dataset.i].rest = v; saveKV('program'); } },
  'pe-equip': (el) => { const e = S.program.days[UI.editDay].exercises[+el.dataset.i]; e.equip = el.value; e.inc = EQUIP[el.value].inc; saveKV('program'); renderSheet(); },
  'pe-warmup': (el) => { S.program.days[UI.editDay].warmup = el.value.split('|').map((s) => s.trim()).filter(Boolean); saveKV('program'); },
  'pe-finisher': (el) => { S.program.days[UI.editDay].finisher = el.value; saveKV('program'); },
};
const changes = {
  'item-g': () => renderSheet(),
  'meal-fav': (el) => { UI.mealDraft.fav = el.checked; renderSheet(); },
  'meal-photo': async (el) => { const f = el.files[0]; if (!f) return; const blob = await resizeImage(f, 1000); const thumb = await resizeImage(f, 240); UI.mealDraft.photo = { id: uid(), blob, thumb }; renderSheet(); },
  'checkin-photo': async (el) => { const f = el.files[0]; if (!f) return; await savePhoto(f, { pose: el.dataset.pose }); renderSheet(); toast('Photo saved'); },
  'progress-photo': async (el) => { const f = el.files[0]; if (!f) return; const note = prompt('Optional note (e.g. “morning, relaxed” or “after Push, pump”)', '') || ''; await savePhoto(f, { note }); render(); toast('Photo saved'); },
  'import-file': async (el) => {
    const f = el.files[0]; if (!f) return;
    try {
      const json = JSON.parse(await f.text());
      if (json.kind === 'backup' && S.profile && !confirm('Restoring a backup replaces ALL current data on this iPhone with the backup. Continue?')) return;
      const kind = await importFile(json);
      await load();
      if (kind === 'setup' && !S.body.length && S.profile?.startWeight) await addBody({ date: today(), weight: S.profile.startWeight }); urlCache.clear(); UI.sheet = null; renderSheet(); render();
      toast(kind === 'backup' ? 'Backup restored' : 'Setup imported — welcome!');
    } catch (e) { alert(e.message || 'Could not read this file.'); }
  },
};
document.addEventListener('input', (ev) => { const fn = inputs[ev.target.dataset?.in]; if (fn) fn(ev.target); });
document.addEventListener('change', (ev) => { const fn = changes[ev.target.dataset?.in]; if (fn) fn(ev.target); });
document.addEventListener('focusin', (ev) => { if (ev.target.matches('.set input')) setTimeout(() => ev.target.select(), 0); });

/* ───────────────────────── Boot ───────────────────────── */
let lastDay = today();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && today() !== lastDay) { lastDay = today(); render(); }
});

async function showStorage() {
  const el = $('#storage-info');
  if (el && navigator.storage?.estimate) { const e = await navigator.storage.estimate(); el.textContent = `Using ${(e.usage / 1e6).toFixed(1)} MB on this device.`; }
}
new MutationObserver(() => showStorage()).observe(sheetEl, { childList: true });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  });
  let reloaded = false;
  const hadController = !!navigator.serviceWorker.controller; // first install is not an update
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded || !hadController) return;
    // Never interrupt a workout or an open form: apply the update on the next launch instead.
    if (!S.active && !UI.sheet) { reloaded = true; location.reload(); }
    else toast('Update installed — it applies next time you open the app.');
  });
}

(async function boot() {
  await db.persist();
  await load();
  render();
  if (S.active) toast('Workout in progress — tap Resume');
})();

// Expose for debugging/tests in the browser console.
window.__coach = { S, UI, render };
