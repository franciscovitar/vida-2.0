/**
 * Nombres exactos de pestañas y encabezados del Sheet DEV.
 *
 * La lectura es acotada: solo estas dos pestañas y solo estos encabezados
 * (mapeados por nombre). No se lee el spreadsheet completo de forma indiscriminada.
 */

export const REGISTRO_DIARIO_TAB = 'Registro diario';
export const SALUD_TAB = 'Salud y experimentos';

/** Encabezados de "Registro diario" (claves internas → nombre en el Sheet). */
export const RD = {
  fecha: 'Fecha',
  sleep: 'Sueño (h)',
  energy: 'Energía (1-5)',
  mood: 'Ánimo (1-5)',
  firstAlarm: 'Primera alarma',
  bed: 'Tender la cama',
  shower: 'Bañarme al levantarme',
  posture: 'Postura 5 min',
  gym: 'Gimnasio',
  cardio: 'Zona 2 / cardio',
  stretch: 'Estiramiento post-gym',
  mealPrep: 'Comida / meal prep',
  journaling: 'Journaling',
  football: 'Fútbol',
  screen: 'Pantalla (min)',
  work: 'Trabajo / Genova (min)',
  faculty: 'Facultad (min)',
  vida2: 'Vida 2.0 (min)',
  leisure: 'Ocio y comunicación (min)',
  pcActive: 'PC activo (min)',
  pcAway: 'PC ausente (min)',
  unclassified: 'Sin clasificar (min)',
} as const;

/** Encabezados requeridos en "Registro diario". */
export const REGISTRO_DIARIO_HEADERS: readonly string[] = Object.values(RD);

/** Columnas booleanas (hábitos) de "Registro diario". */
export const RD_HABIT_HEADERS: readonly string[] = [
  RD.firstAlarm,
  RD.bed,
  RD.shower,
  RD.posture,
  RD.gym,
  RD.cardio,
  RD.stretch,
  RD.mealPrep,
  RD.journaling,
  RD.football,
];

/** Encabezados de "Salud y experimentos" (claves internas → nombre en el Sheet). */
export const SAL = {
  fecha: 'Fecha',
  sleep: 'Sueño (h)',
  hrv: 'VFC / HRV (ms)',
  restingHr: 'FC reposo',
  meanHr: 'FC media',
  steps: 'Pasos',
  activeCalories: 'Calorías activas',
  workout: 'Entrenamiento',
  deepSleep: 'Sueño profundo (h)',
  remSleep: 'Sueño REM (h)',
  walkRunKm: 'Distancia caminar + correr (km)',
  minHr: 'FC mínima',
  maxHr: 'FC máxima',
  spo2: 'Saturación de oxígeno (%)',
  importStatus: 'Estado de importación',
} as const;

/** Encabezados requeridos en "Salud y experimentos". */
export const SALUD_HEADERS: readonly string[] = Object.values(SAL);
