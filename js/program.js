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
