export type GymStrengthBenchmarkExerciseId =
  | 'lat-pulldown'
  | 'machine-row'
  | 'machine-bench-press'
  | 'machine-shoulder-press'
  | 'dumbbell-curl'
  | 'dumbbell-lateral-raise'
  | 'cable-french-press'
  | 'triceps-pushdown'
  | 'face-pull'
  | 'horizontal-leg-press'
  | 'hip-thrust'
  | 'lying-leg-curl'
  | 'machine-abductor'
  | 'machine-adductor'
  | 'standing-calf-machine'
  | 'seated-calf-raise';

export type GymStrengthBenchmarkComparability = 'direct' | 'equipment-dependent' | 'proxy';
export type GymStrengthExerciseConfidence = 'high' | 'medium' | 'low';

export interface GymStrengthThresholds {
  beginner: number;
  novice: number;
  intermediate: number;
  advanced: number;
  elite: number;
}

export interface GymStrengthBenchmarkBaselineEntry {
  id: GymStrengthBenchmarkExerciseId;
  benchmarkName: string;
  matches: (exerciseName: string) => boolean;
  thresholds: Readonly<GymStrengthThresholds>;
  comparability: GymStrengthBenchmarkComparability;
  confidence: GymStrengthExerciseConfidence;
  note: string;
}

/**
 * Canonical fixed benchmark table requested for Vida 2.0 on 2026-09-02.
 * Values are male absolute 1RM thresholds in kg. Dumbbell values are per dumbbell.
 * Keep this table stable and versioned; do not refresh it from a live website at runtime.
 */
export const GYM_MALE_ABSOLUTE_1RM_BASELINE_VERSION = '2026-09-02-v1';

export const GYM_MALE_ABSOLUTE_1RM_BASELINE: readonly GymStrengthBenchmarkBaselineEntry[] = [
  {
    id: 'lat-pulldown',
    benchmarkName: 'Jalón al pecho',
    matches: (name) => /jal[oó]n al pecho/i.test(name),
    thresholds: { beginner: 42, novice: 60, intermediate: 82, advanced: 107, elite: 134 },
    comparability: 'equipment-dependent',
    confidence: 'medium',
    note: 'La resistencia real puede variar entre poleas y máquinas.',
  },
  {
    id: 'machine-row',
    benchmarkName: 'Remo máquina',
    matches: (name) => /remo.*m[aá]quina/i.test(name),
    thresholds: { beginner: 41, novice: 67, intermediate: 100, advanced: 141, elite: 186 },
    comparability: 'equipment-dependent',
    confidence: 'low',
    note: 'La mecánica y relación de poleas puede cambiar entre máquinas.',
  },
  {
    id: 'machine-bench-press',
    benchmarkName: 'Press banca máquina',
    matches: (name) => /press (?:de )?(?:banca|pecho).*m[aá]quina/i.test(name),
    thresholds: { beginner: 34, novice: 56, intermediate: 86, advanced: 121, elite: 161 },
    comparability: 'equipment-dependent',
    confidence: 'low',
    note: 'La carga mostrada no representa exactamente la misma resistencia entre máquinas.',
  },
  {
    id: 'machine-shoulder-press',
    benchmarkName: 'Press militar máquina',
    matches: (name) => /press militar.*m[aá]quina/i.test(name),
    thresholds: { beginner: 25, novice: 45, intermediate: 73, advanced: 108, elite: 148 },
    comparability: 'equipment-dependent',
    confidence: 'low',
    note: 'La carga mostrada depende de la máquina y su relación mecánica.',
  },
  {
    id: 'dumbbell-curl',
    benchmarkName: 'Curl bíceps mancuerna',
    matches: (name) => /curl (?:de )?b[ií]ceps.*mancuerna/i.test(name),
    thresholds: { beginner: 7, novice: 13, intermediate: 21, advanced: 31, elite: 42 },
    comparability: 'direct',
    confidence: 'high',
    note: 'Peso por mancuerna.',
  },
  {
    id: 'dumbbell-lateral-raise',
    benchmarkName: 'Elevación lateral mancuerna',
    matches: (name) => /elevaciones? laterales?.*mancuerna/i.test(name),
    thresholds: { beginner: 4, novice: 9, intermediate: 16, advanced: 24, elite: 34 },
    comparability: 'direct',
    confidence: 'high',
    note: 'Peso por mancuerna.',
  },
  {
    id: 'cable-french-press',
    benchmarkName: 'Press francés polea',
    matches: (name) => /press franc[eé]s.*polea/i.test(name),
    thresholds: { beginner: 12, novice: 24, intermediate: 41, advanced: 62, elite: 86 },
    comparability: 'equipment-dependent',
    confidence: 'medium',
    note: 'La resistencia real puede variar según la polea.',
  },
  {
    id: 'triceps-pushdown',
    benchmarkName: 'Tríceps pushdown',
    matches: (name) =>
      /tr[ií]ceps pushdown|pushdown de tr[ií]ceps|jal[oó]n de tr[ií]ceps/i.test(name),
    thresholds: { beginner: 19, novice: 34, intermediate: 54, advanced: 79, elite: 107 },
    comparability: 'equipment-dependent',
    confidence: 'medium',
    note: 'La resistencia real puede variar según la polea.',
  },
  {
    id: 'face-pull',
    benchmarkName: 'Face pull',
    matches: (name) => /face ?pull/i.test(name),
    thresholds: { beginner: 14, novice: 27, intermediate: 45, advanced: 68, elite: 95 },
    comparability: 'equipment-dependent',
    confidence: 'medium',
    note: 'La resistencia real puede variar según la polea.',
  },
  {
    id: 'horizontal-leg-press',
    benchmarkName: 'Prensa horizontal',
    matches: (name) => /prensa(?: horizontal)?/i.test(name),
    thresholds: { beginner: 66, novice: 110, intermediate: 168, advanced: 238, elite: 316 },
    comparability: 'equipment-dependent',
    confidence: 'low',
    note: 'La inclinación, palancas y carga inicial cambian entre prensas.',
  },
  {
    id: 'hip-thrust',
    benchmarkName: 'Hip thrust',
    matches: (name) => /hip thrust/i.test(name),
    thresholds: { beginner: 45, novice: 85, intermediate: 140, advanced: 208, elite: 286 },
    comparability: 'proxy',
    confidence: 'low',
    note: 'La referencia es principalmente para hip thrust convencional; una máquina específica puede diferir.',
  },
  {
    id: 'lying-leg-curl',
    benchmarkName: 'Curl femoral tumbado',
    matches: (name) =>
      /(?:curl )?femoral.*(?:tumbado|acostado)|(?:tumbado|acostado).*femoral/i.test(name),
    thresholds: { beginner: 26, novice: 43, intermediate: 63, advanced: 89, elite: 116 },
    comparability: 'equipment-dependent',
    confidence: 'low',
    note: 'La relación mecánica depende de la máquina.',
  },
  {
    id: 'machine-abductor',
    benchmarkName: 'Abductores máquina',
    matches: (name) => /abductores?.*m[aá]quina|m[aá]quina.*abductores?/i.test(name),
    thresholds: { beginner: 34, novice: 59, intermediate: 92, advanced: 132, elite: 178 },
    comparability: 'equipment-dependent',
    confidence: 'low',
    note: 'La relación mecánica depende de la máquina.',
  },
  {
    id: 'machine-adductor',
    benchmarkName: 'Aductores máquina',
    matches: (name) => /(?:^|\s)aductores?.*m[aá]quina|m[aá]quina.*(?:^|\s)aductores?/i.test(name),
    thresholds: { beginner: 38, novice: 64, intermediate: 99, advanced: 142, elite: 190 },
    comparability: 'equipment-dependent',
    confidence: 'low',
    note: 'La relación mecánica depende de la máquina.',
  },
  {
    id: 'standing-calf-machine',
    benchmarkName: 'Gemelos máquina de pie',
    matches: (name) => /gemelos?.*(?:m[aá]quina.*de pie|de pie)|pantorrilla.*de pie/i.test(name),
    thresholds: { beginner: 43, novice: 82, intermediate: 137, advanced: 205, elite: 284 },
    comparability: 'equipment-dependent',
    confidence: 'low',
    note: 'La carga efectiva depende de la máquina.',
  },
  {
    id: 'seated-calf-raise',
    benchmarkName: 'Sóleo / gemelo sentado',
    matches: (name) => /s[oó]leo|gemelos?.*sentado|pantorrilla.*sentado/i.test(name),
    thresholds: { beginner: 28, novice: 54, intermediate: 91, advanced: 137, elite: 190 },
    comparability: 'equipment-dependent',
    confidence: 'low',
    note: 'La carga efectiva depende de la máquina.',
  },
];

export function findGymStrengthBenchmarkBaseline(
  exerciseName: string,
): GymStrengthBenchmarkBaselineEntry | null {
  return GYM_MALE_ABSOLUTE_1RM_BASELINE.find((entry) => entry.matches(exerciseName)) ?? null;
}
