// Turn the text of a training programme (from a photo via iPhone Live Text, or typed) into a split.
// Works with English and French programmes: "PUSH DAY", "Day 1 – Chest", "Bench press — 3 × 10-12", "3x12", "2–3 sets × 12–15 reps".
import { norm } from './util.js';

const SETS_REPS = /(\d{1,2})\s*(?:(?:-|–|—|to|à)\s*(\d{1,2}))?\s*(?:sets?|s[ée]ries?|x|×|\*)\s*(?:of|de|x|×)?\s*(\d{1,3})\s*(?:(?:-|–|—|to|à)\s*(\d{1,3}))?\s*(?:reps?|r[ée]p\w*)?/i;
const DAY_WORDS = /\b(push|pull|legs?|upper|lower|full\s*body|chest|back|shoulders?|arms?|glutes|biceps|triceps|day\s*\d+|jour\s*\d+|s[ée]ance|session|workout|pectoraux|dos|jambes|[ée]paules|bras)\b/i;
const WARM = /\b(warm|[ée]chauffement|elliptical|elliptique|treadmill|tapis|walking|marche|mobility|mobilit[ée]|stretch|activation)\b/i;
const FINISH = /\b(cardio|bike|v[ée]lo|run|course|hiit)\b/i;
const SECTION = /^(warm[- ]?up|[ée]chauffement|exercises?|exercices?|finish(?:er)?|fin|cool[- ]?down|retour au calme)\s*:?\s*$/i;

const title = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\s+/g, ' ').trim();
const clean = (line) => line.replace(/^[\s•·*▪◦\-–—>]+/, '').replace(/^\d{1,2}\s*[.)]\s+/, '').trim();

export function guessEquip(name) {
  const n = norm(name);
  if (/smith/.test(n)) return 'smith';
  if (/belt squat|leg press|hack|presse|plate/.test(n)) return 'plate';
  if (/dumbbell|halt[eè]re|\bdb\b/.test(n)) return 'dumbbell';
  if (/cable|pulley|poulie|pulldown|tirage|face pull|pushdown|pullover|bar triceps|rope|hammer curl/.test(n)) return 'cable';
  if (/barbell|\bbar\b|barre|bench press|d[ée]velopp[ée] couch[ée]|deadlift|row|squat|soulev/.test(n)) return 'barbell';
  if (/\babs?\b|abdos?|plank|gainage|crunch|push[- ]?up|pompes?|pull[- ]?up|tractions?|\bdips?\b|accessor/.test(n)) return 'bodyweight';
  return 'machine';
}

export function guessMuscles(name) {
  const n = norm(name);
  const rules = [
    [/bench|chest|pec|fly|d[ée]velopp[ée] couch|incline|dips?/, ['chest', 'triceps', 'shoulders']],
    [/lateral|shoulder|[ée]paule|overhead press|military|ohp|face pull|deltoid|rear delt/, ['shoulders']],
    [/triceps|pushdown|skull|extension triceps|bar triceps/, ['triceps']],
    [/curl|biceps/, ['biceps']],
    [/pulldown|pull[- ]?up|traction|row|rowing|tirage|pullover|lat\b|back|dos/, ['back', 'biceps']],
    [/leg curl|hamstring|ischio|romanian|rdl|deadlift/, ['hamstrings', 'glutes']],
    [/calf|mollet/, ['calves']],
    [/adduct/, ['adductors']],
    [/hip thrust|glute|fessier/, ['glutes']],
    [/squat|leg press|presse|lunge|fente|leg extension|quad/, ['quads', 'glutes']],
    [/\babs?\b|abdo|crunch|plank|gainage|core/, ['abs']],
  ];
  for (const [re, m] of rules) if (re.test(n)) return m;
  return [];
}

function dayName(line) {
  let s = line.replace(/[:：]\s*$/, '').trim();
  const after = s.match(/^(?:day|jour|s[ée]ance|session)\s*\d+\s*[-–—:]\s*(.+)$/i);
  if (after) s = after[1];
  s = s.replace(/\b(day|jour|workout|s[ée]ance)\b/gi, '').replace(/\s{2,}/g, ' ').trim();
  return title(s || line);
}

const isHeader = (line) => {
  if (SETS_REPS.test(line) || line.length > 40) return false;
  const words = line.split(/\s+/).length;
  if (/[:：]\s*$/.test(line) && !SECTION.test(line) && DAY_WORDS.test(line)) return true;
  if (DAY_WORDS.test(line) && words <= 5 && (line === line.toUpperCase() || /\b(day|jour|s[ée]ance)\b/i.test(line))) return true;
  return false;
};

export function parseSplitText(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const days = [];
  let cur = null, mode = 'exercises';
  const newDay = (name) => { cur = { name, warmup: [], finisher: '', exercises: [] }; days.push(cur); mode = 'exercises'; };
  for (const raw of lines) {
    const line = clean(raw);
    if (!line) continue;
    if (SECTION.test(line)) {
      const s = norm(line);
      mode = /warm|chauff/.test(s) ? 'warmup' : /finish|fin\b|cool|calme/.test(s) ? 'finish' : 'exercises';
      continue;
    }
    if (isHeader(line)) { newDay(dayName(line)); continue; }
    if (!cur) newDay('Workout');
    const m = line.match(SETS_REPS);
    if (!m && (mode === 'warmup' || WARM.test(line))) { cur.warmup.push(line.replace(/\s*[:–—-]\s*/, ' · ')); continue; }
    if (!m && (mode === 'finish' || FINISH.test(line))) { cur.finisher = line.replace(/\s*[:–—-]\s*/, ' · '); continue; }
    let name = (m ? line.slice(0, m.index) : line).replace(/[\s—–\-:,(]+$/, '').trim();
    if (!name && m) name = line.slice(m.index + m[0].length).replace(/^[\s—–\-:,]+/, '').trim();
    if (!name || name.length < 2 || /^\d+$/.test(name)) continue;
    const equip = guessEquip(name);
    let sets = [3, 3], reps = equip === 'bodyweight' ? [12, 20] : [10, 12];
    if (m) {
      const s1 = +m[1], s2 = +(m[2] || m[1]), r1 = +m[3], r2 = +(m[4] || m[3]);
      if (s1 >= 1 && s1 <= 10) sets = [Math.min(s1, s2), Math.max(s1, s2)];
      if (r1 >= 1 && r1 <= 100) reps = [Math.min(r1, r2), Math.max(r1, r2)];
    }
    cur.exercises.push({ name: name.charAt(0).toUpperCase() + name.slice(1), sets, reps, equip, muscles: guessMuscles(name) });
  }
  return days.filter((d) => d.exercises.length);
}
