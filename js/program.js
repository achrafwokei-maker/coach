// The coach's starting programme. Exercise ids are permanent: history is keyed by id,
// so renaming, reordering or removing an exercise never loses past records.
export const EQUIP = {
  barbell: { label: 'Barbell', unit: 'kg total (bar included)', inc: 2.5 },
  smith: { label: 'Smith machine', unit: 'kg added plates', inc: 2.5 },
  dumbbell: { label: 'Dumbbells', unit: 'kg per dumbbell', inc: 2 },
  machine: { label: 'Machine', unit: 'kg on the stack', inc: 2.5 },
  plate: { label: 'Plate-loaded', unit: 'kg plates loaded', inc: 5 },
  cable: { label: 'Cable', unit: 'kg on the stack', inc: 2.5 },
  bodyweight: { label: 'Bodyweight', unit: 'reps only', inc: 0 },
};

const ex = (id, name, equip, sets, reps, muscles, extra = {}) => ({
  id, name, equip, sets, reps, muscles, inc: EQUIP[equip].inc, rest: 90, ...extra,
});

export const DEFAULT_PROGRAM = {
  rotation: ['push', 'pull', 'legs'],
  trainingDays: [1, 3, 5], // Mon, Wed, Fri — editable
  perWeek: 3,
  days: {
    push: {
      name: 'Push',
      warmup: ['Elliptical · 5–10 min', 'Mobility & core activation'],
      finisher: 'Cardio · 10 min',
      exercises: [
        ex('bench', 'Barbell bench press', 'barbell', [2, 3], [12, 12], ['chest', 'triceps', 'shoulders'], { rest: 120 }),
        ex('incline_smith', 'Incline Smith machine press', 'smith', [2, 3], [12, 12], ['chest', 'shoulders', 'triceps'], { rest: 120 }),
        ex('db_fly', 'Dumbbell fly', 'dumbbell', [2, 3], [12, 15], ['chest']),
        ex('oh_tri', 'Overhead triceps extension', 'cable', [2, 3], [12, 15], ['triceps']),
        ex('lat_raise_m', 'Machine lateral raise', 'machine', [2, 3], [12, 12], ['shoulders']),
        ex('bar_tri', 'Bar triceps extension', 'cable', [2, 3], [12, 15], ['triceps']),
        ex('abs_push', 'Abs', 'bodyweight', [2, 3], [12, 20], ['abs'], { rest: 60 }),
      ],
    },
    pull: {
      name: 'Pull',
      warmup: ['Elliptical · 5–7 min', 'Mobility & core activation'],
      finisher: 'Cardio · 10 min',
      exercises: [
        ex('lat_pd_wide', 'Wide-grip lat pulldown', 'cable', [2, 3], [12, 15], ['back', 'biceps']),
        ex('row_close', 'Close-grip barbell row', 'barbell', [2, 3], [12, 12], ['back', 'biceps'], { rest: 120 }),
        ex('pullover', 'Pullover', 'cable', [2, 3], [12, 12], ['back', 'chest']),
        ex('face_pull', 'Face pulls', 'cable', [2, 3], [12, 15], ['shoulders', 'back']),
        ex('incl_db_curl', 'Incline dumbbell biceps curl', 'dumbbell', [2, 3], [15, 15], ['biceps']),
        ex('cable_hammer', 'Cable hammer curl', 'cable', [2, 3], [12, 15], ['biceps']),
        ex('abs_pull', 'Abs / accessories', 'bodyweight', [2, 3], [12, 20], ['abs'], { rest: 60 }),
      ],
    },
    legs: {
      name: 'Legs',
      warmup: ['Walking · 5–10 min', 'Mobility & core activation'],
      finisher: 'Cardio · 15 min',
      exercises: [
        ex('belt_squat', 'Belt squat', 'plate', [2, 3], [12, 15], ['quads', 'glutes'], { rest: 120 }),
        ex('lunges', 'Walking lunges', 'dumbbell', [2, 3], [12, 12], ['quads', 'glutes'], { note: 'Reps per leg · weight per dumbbell', rest: 120 }),
        ex('leg_press', 'Leg press', 'plate', [2, 3], [12, 12], ['quads', 'glutes'], { rest: 120 }),
        ex('leg_curl', 'Leg curl', 'machine', [2, 3], [12, 15], ['hamstrings']),
        ex('leg_ext', 'Leg extension', 'machine', [2, 3], [15, 15], ['quads']),
        ex('adductor', 'Adductor machine', 'machine', [2, 3], [12, 15], ['adductors']),
        ex('calf', 'Calf raises', 'machine', [2, 3], [15, 15], ['calves'], { rest: 60 }),
      ],
    },
  },
};

export const cloneProgram = (p = DEFAULT_PROGRAM) => JSON.parse(JSON.stringify(p));

// Every exercise ever defined (including ones archived from the programme) for history lookup.
export function allExercises(program) {
  const map = {};
  for (const [dayId, day] of Object.entries(program.days)) {
    for (const e of day.exercises) map[e.id] = { ...e, dayId };
  }
  for (const e of program.archived || []) if (!map[e.id]) map[e.id] = { ...e, archived: true };
  return map;
}

// Ready-made splits for anyone. Shared exercises reuse the same id, so history carries over between splits.
const day = (name, warmup, finisher, exercises) => ({ name, warmup, finisher, exercises });
const W = ['Cardio warm-up · 5–10 min', 'Mobility & core activation'];
export const SPLITS = {
  ppl: { name: 'Push / Pull / Legs', desc: '3 days · the coach’s original plan', perWeek: 3, trainingDays: [1, 3, 5], build: () => cloneProgram(DEFAULT_PROGRAM) },
  upper_lower: {
    name: 'Upper / Lower', desc: '4 days · strength + size', perWeek: 4, trainingDays: [1, 2, 4, 5],
    build: () => ({ rotation: ['upper', 'lower'], days: {
      upper: day('Upper', W, 'Cardio · 10 min', [
        ex('bench', 'Barbell bench press', 'barbell', [3, 3], [8, 12], ['chest', 'triceps', 'shoulders'], { rest: 150 }),
        ex('row_close', 'Close-grip barbell row', 'barbell', [3, 3], [8, 12], ['back', 'biceps'], { rest: 150 }),
        ex('ohp_db', 'Seated dumbbell shoulder press', 'dumbbell', [2, 3], [10, 12], ['shoulders', 'triceps']),
        ex('lat_pd_wide', 'Wide-grip lat pulldown', 'cable', [2, 3], [10, 12], ['back', 'biceps']),
        ex('incl_db_curl', 'Incline dumbbell biceps curl', 'dumbbell', [2, 3], [10, 15], ['biceps']),
        ex('bar_tri', 'Bar triceps extension', 'cable', [2, 3], [10, 15], ['triceps']),
      ]),
      lower: day('Lower', ['Walking · 5–10 min', 'Mobility & core activation'], 'Cardio · 10 min', [
        ex('belt_squat', 'Belt squat', 'plate', [3, 3], [8, 12], ['quads', 'glutes'], { rest: 150 }),
        ex('rdl', 'Romanian deadlift', 'barbell', [3, 3], [8, 12], ['hamstrings', 'glutes'], { rest: 150 }),
        ex('leg_press', 'Leg press', 'plate', [2, 3], [10, 12], ['quads', 'glutes']),
        ex('leg_curl', 'Leg curl', 'machine', [2, 3], [10, 15], ['hamstrings']),
        ex('calf', 'Calf raises', 'machine', [2, 3], [12, 15], ['calves'], { rest: 60 }),
        ex('abs_lower', 'Abs', 'bodyweight', [2, 3], [12, 20], ['abs'], { rest: 60 }),
      ]),
    } }),
  },
  full_body: {
    name: 'Full body', desc: '3 days · whole body each time', perWeek: 3, trainingDays: [1, 3, 5],
    build: () => ({ rotation: ['full_a', 'full_b'], days: {
      full_a: day('Full A', W, 'Cardio · 10 min', [
        ex('leg_press', 'Leg press', 'plate', [3, 3], [10, 12], ['quads', 'glutes']),
        ex('bench', 'Barbell bench press', 'barbell', [3, 3], [8, 12], ['chest', 'triceps', 'shoulders'], { rest: 150 }),
        ex('lat_pd_wide', 'Wide-grip lat pulldown', 'cable', [3, 3], [10, 12], ['back', 'biceps']),
        ex('lat_raise_m', 'Machine lateral raise', 'machine', [2, 3], [12, 15], ['shoulders']),
        ex('abs_full', 'Abs', 'bodyweight', [2, 3], [12, 20], ['abs'], { rest: 60 }),
      ]),
      full_b: day('Full B', W, 'Cardio · 10 min', [
        ex('rdl', 'Romanian deadlift', 'barbell', [3, 3], [8, 12], ['hamstrings', 'glutes'], { rest: 150 }),
        ex('incline_smith', 'Incline Smith machine press', 'smith', [3, 3], [8, 12], ['chest', 'shoulders', 'triceps']),
        ex('row_close', 'Close-grip barbell row', 'barbell', [3, 3], [8, 12], ['back', 'biceps']),
        ex('incl_db_curl', 'Incline dumbbell biceps curl', 'dumbbell', [2, 3], [10, 15], ['biceps']),
        ex('oh_tri', 'Overhead triceps extension', 'cable', [2, 3], [10, 15], ['triceps']),
      ]),
    } }),
  },
  bro: {
    name: '5-day split', desc: '5 days · one muscle group per day', perWeek: 5, trainingDays: [1, 2, 3, 4, 5],
    build: () => ({ rotation: ['chest', 'back', 'shoulders', 'legs', 'arms'], days: {
      chest: day('Chest', W, 'Cardio · 10 min', [ex('bench', 'Barbell bench press', 'barbell', [3, 4], [8, 12], ['chest', 'triceps', 'shoulders'], { rest: 150 }), ex('incline_smith', 'Incline Smith machine press', 'smith', [3, 3], [10, 12], ['chest', 'shoulders']), ex('db_fly', 'Dumbbell fly', 'dumbbell', [2, 3], [12, 15], ['chest'])]),
      back: day('Back', W, 'Cardio · 10 min', [ex('lat_pd_wide', 'Wide-grip lat pulldown', 'cable', [3, 4], [10, 12], ['back', 'biceps']), ex('row_close', 'Close-grip barbell row', 'barbell', [3, 3], [8, 12], ['back', 'biceps']), ex('pullover', 'Pullover', 'cable', [2, 3], [12, 15], ['back'])]),
      shoulders: day('Shoulders', W, 'Cardio · 10 min', [ex('ohp_db', 'Seated dumbbell shoulder press', 'dumbbell', [3, 3], [8, 12], ['shoulders', 'triceps']), ex('lat_raise_m', 'Machine lateral raise', 'machine', [3, 4], [12, 15], ['shoulders']), ex('face_pull', 'Face pulls', 'cable', [2, 3], [12, 15], ['shoulders', 'back'])]),
      legs: day('Legs', ['Walking · 5–10 min', 'Mobility & core activation'], 'Cardio · 15 min', [ex('belt_squat', 'Belt squat', 'plate', [3, 4], [10, 12], ['quads', 'glutes']), ex('leg_press', 'Leg press', 'plate', [3, 3], [10, 12], ['quads', 'glutes']), ex('leg_curl', 'Leg curl', 'machine', [3, 3], [12, 15], ['hamstrings']), ex('calf', 'Calf raises', 'machine', [3, 3], [15, 15], ['calves'])]),
      arms: day('Arms', W, 'Cardio · 10 min', [ex('incl_db_curl', 'Incline dumbbell biceps curl', 'dumbbell', [3, 3], [10, 15], ['biceps']), ex('bar_tri', 'Bar triceps extension', 'cable', [3, 3], [10, 15], ['triceps']), ex('cable_hammer', 'Cable hammer curl', 'cable', [2, 3], [12, 15], ['biceps']), ex('oh_tri', 'Overhead triceps extension', 'cable', [2, 3], [12, 15], ['triceps'])]),
    } }),
  },
};

// Switch split, keeping every old exercise in the archive so its history stays reachable.
export function applySplit(current, key) {
  const t = SPLITS[key];
  const next = { ...t.build(), perWeek: t.perWeek, trainingDays: [...t.trainingDays], split: key };
  const ids = new Set(Object.values(next.days).flatMap((d) => d.exercises.map((e) => e.id)));
  const old = [...Object.values(current?.days || {}).flatMap((d) => d.exercises), ...(current?.archived || [])];
  const seen = new Set();
  next.archived = old.filter((e) => !ids.has(e.id) && !seen.has(e.id) && seen.add(e.id));
  return next;
}

export const MUSCLES = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'abs', 'adductors'];
