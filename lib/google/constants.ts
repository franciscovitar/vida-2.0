/**
 * Nombres exactos de pestañas y encabezados del Sheet de hábitos.
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

/** Encabezados core de "Salud y experimentos". */
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

/** Encabezados requeridos para mantener compatibilidad con la fuente histórica. */
export const SALUD_HEADERS: readonly string[] = Object.values(SAL);

/**
 * Columnas adicionales que Health Sync V2 ya escribe en Production.
 * Son optativas para que datos/mocks históricos sigan siendo legibles.
 */
export const SAL_EXTENDED = {
  sleepAsleep: 'Sueño dormido (h)',
  sleepInBed: 'Sueño en cama (h)',
  coreSleep: 'Sueño núcleo (h)',
  awakeSleep: 'Sueño despierto (h)',
  activeEnergyKj: 'Energía activa (kJ)',
  stepLengthCm: 'Longitud de paso (cm)',
  restingEnergyKj: 'Energía en reposo (kJ)',
  floorsClimbed: 'Pisos subidos',
  walkingAsymmetry: 'Asimetría al caminar (%)',
  walkingSpeed: 'Velocidad al caminar (km/h)',
  missingCore: 'Faltantes core',
} as const;
