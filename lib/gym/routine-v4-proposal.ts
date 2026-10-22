/**
 * Alternativa V4 de Gimnasio (2026-10-22).
 *
 * Borrador de prueba solicitado para consultar en Vida 2.0 sin reemplazar
 * la prescripción activa de Notion ni escribir en el historial de Sheets.
 * Su adopción no se infiere de que exista esta ficha.
 */
export type GymV4Exercise = {
  name: string;
  sets: number;
  reps: string;
  rest: string;
  note?: string;
};

export type GymV4Day = {
  id: 'a' | 'b' | 'c';
  label: string;
  focus: string;
  exercises: readonly GymV4Exercise[];
  supersets: readonly string[];
  mobility: readonly string[];
};

export const GYM_V4_DAYS: readonly GymV4Day[] = [
  {
    id: 'a',
    label: 'Día A',
    focus: 'Torso + glúteos',
    exercises: [
      { name: 'Press inclinado máquina', sets: 3, reps: '6–10', rest: '120 s', note: 'Usar una estación estable; revisar la asimetría de la FOX antes de cargar exigentemente.' },
      { name: 'Jalón al pecho', sets: 3, reps: '6–10', rest: '90–120 s' },
      { name: 'Remo máquina', sets: 3, reps: '6–10', rest: '90–120 s' },
      { name: 'Hip thrust', sets: 2, reps: '8–12', rest: '90 s' },
      { name: 'Extensión de cuádriceps', sets: 2, reps: '10–15', rest: '60 s' },
      { name: 'Elevaciones laterales', sets: 4, reps: '8–15', rest: '60 s' },
      { name: 'Remo codos abiertos', sets: 2, reps: '10–15', rest: '60 s' },
      { name: 'Bíceps sentado', sets: 3, reps: '6–10', rest: '60–75 s' },
      { name: 'Press francés polea', sets: 3, reps: '8–12', rest: '60–75 s' },
    ],
    supersets: ['Bíceps sentado + press francés.', 'Opcional: extensiones de cuádriceps + elevaciones laterales.'],
    mobility: ['Wall slide', 'Y-raise', 'Rotación torácica', 'Pectorales y dorsales'],
  },
  {
    id: 'b',
    label: 'Día B',
    focus: 'Piernas + brazos',
    exercises: [
      { name: 'Prensa horizontal', sets: 3, reps: '6–10', rest: '120 s', note: 'Recorrido cómodo y repetible; no forzar la zona proximal de isquios/glúteo.' },
      { name: 'Hip thrust', sets: 4, reps: '6–10', rest: '90–120 s' },
      { name: 'Curl femoral sentado', sets: 3, reps: '8–12', rest: '75–90 s', note: 'Variante candidata: si no hay máquina sentada cómoda, mantener el curl femoral tumbado.' },
      { name: 'Extensión de cuádriceps', sets: 2, reps: '10–15', rest: '60 s' },
      { name: 'Gemelos de pie', sets: 4, reps: '8–15', rest: '60 s' },
      { name: 'Aductores máquina', sets: 2, reps: '10–15', rest: '60 s' },
      { name: 'Abdominal con carga', sets: 2, reps: '8–15', rest: '60 s' },
      { name: 'Curl martillo', sets: 2, reps: '8–12', rest: '60 s' },
      { name: 'Extensión de tríceps', sets: 2, reps: '8–12', rest: '60 s' },
    ],
    supersets: ['Curl martillo + extensión de tríceps.'],
    mobility: ['Couch stretch', 'Gemelos', 'Cuclilla profunda', 'Isquios', 'Glúteo en figura cuatro'],
  },
  {
    id: 'c',
    label: 'Día C',
    focus: 'Torso + femorales',
    exercises: [
      { name: 'Press inclinado', sets: 3, reps: '6–10', rest: '120 s', note: 'Misma variante estable que el Día A; no forzar una máquina desalineada.' },
      { name: 'Jalón al pecho', sets: 3, reps: '6–10', rest: '90–120 s' },
      { name: 'Remo máquina', sets: 3, reps: '6–10', rest: '90–120 s' },
      { name: 'Press militar', sets: 2, reps: '5–8', rest: '120 s' },
      { name: 'Elevaciones laterales', sets: 4, reps: '8–15', rest: '60 s' },
      { name: 'Remo codos abiertos', sets: 2, reps: '10–15', rest: '60 s' },
      { name: 'Curl femoral', sets: 2, reps: '8–12', rest: '75–90 s' },
      { name: 'Bíceps sentado', sets: 3, reps: '6–10', rest: '60–75 s' },
      { name: 'Press francés', sets: 3, reps: '8–12', rest: '60–75 s' },
    ],
    supersets: ['Bíceps sentado + press francés.'],
    mobility: ['Chin tuck', 'Movilidad torácica', 'Control escapular', 'Zonas rígidas según necesidad'],
  },
];

export const GYM_V4_DAY_SETS = GYM_V4_DAYS.map((day) =>
  day.exercises.reduce((count, exercise) => count + exercise.sets, 0),
);

export const GYM_V4_WEEKLY_SETS = GYM_V4_DAY_SETS.reduce((total, sets) => total + sets, 0);
