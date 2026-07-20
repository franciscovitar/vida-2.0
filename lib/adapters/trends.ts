/**
 * Agregaciones cross-domain para /tendencias (determinísticas).
 */
import { compareRates, compareTotals, type PeriodCompare } from '@/lib/adapters/compare';
import { alignByDate, spearmanFromPairs, type AlignedPair } from '@/lib/adapters/correlation';
import { addDaysYmd, weekdayMondayIndex } from '@/lib/adapters/dates';
import { productivityAvailableDays, productivityHasData } from '@/lib/adapters/productivity-period';
import { habitEvaluablePastDays } from '@/lib/adapters/habits-period';
import type { Cell } from '@/lib/adapters/cells';
import type { RegistroRecord } from '@/lib/adapters/registro-diario';
import { parseImportStatus, saludHasData, type SaludRecord } from '@/lib/adapters/salud';
import { saludAvailableDays } from '@/lib/adapters/salud-period';
import { HABIT_ACTIVATION_DATES, habitActivationDate } from '@/lib/habits/activation';
import { RD } from '@/lib/google/constants';
import { formatDuration, formatNumber } from '@/lib/format';
import type { PeriodWindow } from '@/lib/periods';
import { previousPeriodWindow } from '@/lib/periods';
import type {
  DataQualityReport,
  TrendMetricSummary,
  TrendSeries,
  TrendsCoverage,
  TrendsPageData,
  VariableRelation,
  WeekdayPatternRow,
  WeekdayPatterns,
} from '@/types/trends';
import type { Domain, TodayStatus } from '@/types';

const WEEKDAY_LABELS = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
] as const;

const DAILY_HABIT_HEADERS = [RD.firstAlarm, RD.bed, RD.shower, RD.posture, RD.journaling] as const;

const TRAINING_HEADERS = [RD.gym, RD.cardio, RD.stretch] as const;

function byDateRegistro(records: readonly RegistroRecord[]): Map<string, RegistroRecord> {
  const map = new Map<string, RegistroRecord>();
  for (const record of records) {
    if (record.date) map.set(record.date, record);
  }
  return map;
}

function byDateSalud(records: readonly SaludRecord[]): Map<string, SaludRecord> {
  const map = new Map<string, SaludRecord>();
  for (const record of records) {
    if (record.date) map.set(record.date, record);
  }
  return map;
}

function num(cell: Cell<number> | undefined): number | null {
  if (!cell || cell.kind !== 'value') return null;
  return cell.value;
}

function sleepHours(
  registro: RegistroRecord | undefined,
  salud: SaludRecord | undefined,
): number | null {
  const fromSalud = num(salud?.sleepHours);
  if (fromSalud !== null) return fromSalud;
  return num(registro?.sleepHours);
}

function isHabitTrue(record: RegistroRecord | undefined, header: string): boolean {
  const cell = record?.habits[header];
  return cell?.kind === 'value' && cell.value === true;
}

/**
 * Cumplimiento diario de hábitos diarios (0–1) solo si hay al menos un hábito evaluable.
 * No inventa ceros por días pre-activación.
 */
function dailyHabitRate(
  record: RegistroRecord | undefined,
  date: string,
  today: string,
): number | null {
  let done = 0;
  let available = 0;
  for (const header of DAILY_HABIT_HEADERS) {
    const activated = habitActivationDate(header);
    if (!activated || date < activated) continue;
    if (date > today) continue;
    if (date === today) {
      if (isHabitTrue(record, header)) {
        available += 1;
        done += 1;
      }
      // pending hoy no entra
      continue;
    }
    available += 1;
    if (isHabitTrue(record, header)) done += 1;
  }
  if (available === 0) return null;
  return done / available;
}

function trainingScore(
  registro: RegistroRecord | undefined,
  salud: SaludRecord | undefined,
): number | null {
  const hasHabit = TRAINING_HEADERS.some((header) => isHabitTrue(registro, header));
  const workout =
    salud?.workout.kind === 'value' && salud.workout.value.trim() !== '' ? true : false;
  if (!registro && !salud) return null;
  // Solo cuenta si hay registro o salud con dato de entrenamiento / hábitos de training.
  if (!hasHabit && !workout) {
    // Día con datos de hábitos/salud pero sin entrenamiento → 0 explícito si hay fila evaluable.
    if (registro || (salud && saludHasData(salud))) return 0;
    return null;
  }
  return 1;
}

function eachDay(window: PeriodWindow, today: string): string[] {
  const days: string[] = [];
  let cursor = window.start;
  while (cursor <= window.end && cursor <= today) {
    days.push(cursor);
    cursor = addDaysYmd(cursor, 1);
  }
  return days;
}

function mapSeries(
  days: readonly string[],
  pick: (date: string) => number | null,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const date of days) {
    const value = pick(date);
    if (value !== null) map.set(date, value);
  }
  return map;
}

function averageOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatHours(value: number | null): string {
  if (value === null) return 'Sin datos';
  return `${Math.round(value * 10) / 10} h`;
}

function formatMinutes(value: number | null): string {
  if (value === null) return 'Sin datos';
  return formatDuration(value);
}

function formatRate(value: number | null): string {
  if (value === null) return 'Sin datos';
  return `${Math.round(value * 100)}%`;
}

function formatSteps(value: number | null): string {
  if (value === null) return 'Sin datos';
  return formatNumber(Math.round(value));
}

function formatPpm(value: number | null): string {
  if (value === null) return 'Sin datos';
  return `${Math.round(value)} ppm`;
}

function formatEnergy(value: number | null): string {
  if (value === null) return 'Sin datos';
  return `${Math.round(value * 10) / 10} / 5`;
}

function deltaNumeric(
  current: number | null,
  previous: number | null,
  format: (v: number) => string,
): { deltaLabel: string; compare: PeriodCompare } {
  if (current === null || previous === null) {
    return {
      deltaLabel: 'Sin comparación',
      compare: { direction: 'none', label: 'Sin comparación', available: false },
    };
  }
  const compare = compareTotals(current, previous);
  const diff = current - previous;
  if (!compare.available) {
    return { deltaLabel: 'Sin comparación', compare };
  }
  if (diff === 0) return { deltaLabel: 'igual', compare };
  const sign = diff > 0 ? '+' : '−';
  return { deltaLabel: `${sign}${format(Math.abs(diff))}`, compare };
}

function deltaRate(
  current: number | null,
  previous: number | null,
): { deltaLabel: string; compare: PeriodCompare } {
  const compare = compareRates(current, previous);
  if (!compare.available || current === null || previous === null) {
    return { deltaLabel: 'Sin comparación', compare };
  }
  const diffPp = Math.round((current - previous) * 1000) / 10;
  if (diffPp === 0) return { deltaLabel: 'igual', compare };
  const sign = diffPp > 0 ? '+' : '−';
  return { deltaLabel: `${sign}${Math.abs(diffPp)} pp`, compare };
}

function periodAverage(
  days: readonly string[],
  pick: (date: string) => number | null,
): { avg: number | null; coverage: number } {
  const values: number[] = [];
  for (const date of days) {
    const value = pick(date);
    if (value !== null) values.push(value);
  }
  return { avg: averageOf(values), coverage: values.length };
}

function earliestActivation(): string {
  return Object.values(HABIT_ACTIVATION_DATES).reduce((min, value) => (value < min ? value : min));
}

function buildCoverage(
  registro: readonly RegistroRecord[],
  salud: readonly SaludRecord[],
  window: PeriodWindow,
  today: string,
  periodDays: TrendsPageData['periodDays'],
): TrendsCoverage {
  const habitDays = habitEvaluablePastDays(window, today, earliestActivation()).length;
  const healthDays = saludAvailableDays(salud, window).length;
  const productivityDays = productivityAvailableDays(registro, window).length;
  const saludMap = byDateSalud(salud);
  let partial = 0;
  for (const date of eachDay(window, today)) {
    const row = saludMap.get(date);
    if (row && parseImportStatus(row.importStatus) === 'partial') partial += 1;
  }
  const days = eachDay(window, today);
  const regMap = byDateRegistro(registro);
  let without = 0;
  for (const date of days) {
    const r = regMap.get(date);
    const s = saludMap.get(date);
    const hasReg = r ? productivityHasData(r) || dailyHabitRate(r, date, today) !== null : false;
    const hasHealth = s ? saludHasData(s) : false;
    if (!hasReg && !hasHealth) without += 1;
  }
  const insufficient = habitDays < 5 && healthDays < 5 && productivityDays < 5;
  return {
    habitsDays: habitDays,
    healthDays,
    productivityDays,
    partialHealthDays: partial,
    daysWithoutData: without,
    periodDays,
    insufficientSample: insufficient,
    notice: insufficient
      ? 'La muestra todavía es limitada para este período; interpretá los resultados con prudencia.'
      : null,
  };
}

function buildSummary(
  days: readonly string[],
  prevDays: readonly string[],
  pickers: {
    habitRate: (d: string) => number | null;
    sleep: (d: string) => number | null;
    steps: (d: string) => number | null;
    restingHr: (d: string) => number | null;
    work: (d: string) => number | null;
    faculty: (d: string) => number | null;
    vida2: (d: string) => number | null;
    leisure: (d: string) => number | null;
    pcActive: (d: string) => number | null;
    weeklyGym: number;
    weeklyGymPrev: number | null;
  },
): TrendMetricSummary[] {
  const items: {
    id: string;
    label: string;
    domain: Domain;
    unit: string;
    pick: (d: string) => number | null;
    format: (v: number | null) => string;
    formatAbs: (v: number) => string;
    rate?: boolean;
  }[] = [
    {
      id: 'habits',
      label: 'Hábitos diarios',
      domain: 'habits',
      unit: '%',
      pick: pickers.habitRate,
      format: formatRate,
      formatAbs: (v) => `${Math.round(v * 100)}%`,
      rate: true,
    },
    {
      id: 'sleep',
      label: 'Sueño',
      domain: 'health',
      unit: 'h',
      pick: pickers.sleep,
      format: formatHours,
      formatAbs: (v) => `${Math.round(v * 10) / 10} h`,
    },
    {
      id: 'steps',
      label: 'Pasos',
      domain: 'health',
      unit: '',
      pick: pickers.steps,
      format: formatSteps,
      formatAbs: (v) => formatNumber(Math.round(v)),
    },
    {
      id: 'restingHr',
      label: 'FC en reposo',
      domain: 'health',
      unit: 'ppm',
      pick: pickers.restingHr,
      format: formatPpm,
      formatAbs: (v) => `${Math.round(v)} ppm`,
    },
    {
      id: 'work',
      label: 'Trabajo',
      domain: 'productivity',
      unit: 'min',
      pick: pickers.work,
      format: formatMinutes,
      formatAbs: (v) => formatDuration(v),
    },
    {
      id: 'faculty',
      label: 'Facultad',
      domain: 'learning',
      unit: 'min',
      pick: pickers.faculty,
      format: formatMinutes,
      formatAbs: (v) => formatDuration(v),
    },
    {
      id: 'vida2',
      label: 'Vida 2.0',
      domain: 'habits',
      unit: 'min',
      pick: pickers.vida2,
      format: formatMinutes,
      formatAbs: (v) => formatDuration(v),
    },
    {
      id: 'leisure',
      label: 'Ocio',
      domain: 'neutral',
      unit: 'min',
      pick: pickers.leisure,
      format: formatMinutes,
      formatAbs: (v) => formatDuration(v),
    },
    {
      id: 'pcActive',
      label: 'PC activa',
      domain: 'productivity',
      unit: 'min',
      pick: pickers.pcActive,
      format: formatMinutes,
      formatAbs: (v) => formatDuration(v),
    },
  ];

  const out: TrendMetricSummary[] = items.map((item) => {
    const current = periodAverage(days, item.pick);
    const previous = periodAverage(prevDays, item.pick);
    const delta = item.rate
      ? deltaRate(current.avg, previous.avg)
      : deltaNumeric(current.avg, previous.avg, item.formatAbs);
    return {
      id: item.id,
      label: item.label,
      domain: item.domain,
      unit: item.unit,
      currentLabel: item.format(current.avg),
      previousLabel: item.format(previous.avg),
      deltaLabel: delta.deltaLabel,
      compare: delta.compare,
      coverageLabel: `${current.coverage} días`,
      currentValue: current.avg,
      previousValue: previous.avg,
    };
  });

  // Meta semanal gym como proxy de metas semanales (promedio de cumplimiento relativo).
  const weeklyCompare =
    pickers.weeklyGymPrev === null
      ? { deltaLabel: 'Sin comparación', compare: compareTotals(pickers.weeklyGym, null) }
      : deltaNumeric(pickers.weeklyGym, pickers.weeklyGymPrev, (v) => `${Math.round(v * 10) / 10}`);
  out.splice(1, 0, {
    id: 'weeklyGoals',
    label: 'Metas semanales (prom. veces)',
    domain: 'habits',
    unit: 'veces',
    currentLabel:
      pickers.weeklyGym === null || Number.isNaN(pickers.weeklyGym)
        ? 'Sin datos'
        : `${Math.round(pickers.weeklyGym * 10) / 10} veces/sem`,
    previousLabel:
      pickers.weeklyGymPrev === null
        ? 'Sin datos'
        : `${Math.round(pickers.weeklyGymPrev * 10) / 10} veces/sem`,
    deltaLabel: weeklyCompare.deltaLabel,
    compare: weeklyCompare.compare,
    coverageLabel: 'por semana',
    currentValue: pickers.weeklyGym,
    previousValue: pickers.weeklyGymPrev,
  });

  return out;
}

function weeklyGoalAverage(
  map: Map<string, RegistroRecord>,
  window: PeriodWindow,
  today: string,
): number | null {
  const headers = [RD.gym, RD.cardio, RD.stretch, RD.mealPrep, RD.football];
  const counts: number[] = [];
  const seen = new Set<string>();
  let cursor = window.start;
  while (cursor <= window.end && cursor <= today) {
    const monday = addDaysYmd(cursor, -weekdayMondayIndex(cursor));
    if (!seen.has(monday)) {
      seen.add(monday);
      const weekEnd = addDaysYmd(monday, 6);
      let total = 0;
      let any = false;
      for (const header of headers) {
        let c = monday;
        let count = 0;
        while (c <= weekEnd && c <= today) {
          if (c >= window.start && c <= window.end && isHabitTrue(map.get(c), header)) {
            count += 1;
            any = true;
          }
          c = addDaysYmd(c, 1);
        }
        total += count;
      }
      if (any) counts.push(total / headers.length);
    }
    cursor = addDaysYmd(cursor, 1);
  }
  return averageOf(counts);
}

function buildEvolution(
  days: readonly string[],
  pickers: Record<string, (d: string) => number | null>,
): TrendSeries[] {
  const defs: { id: string; label: string; domain: Domain; unit: string }[] = [
    { id: 'sleep', label: 'Sueño', domain: 'health', unit: 'h' },
    { id: 'energy', label: 'Energía', domain: 'health', unit: '1-5' },
    { id: 'habits', label: 'Cumplimiento de hábitos', domain: 'habits', unit: '%' },
    {
      id: 'productivity',
      label: 'Productividad (trabajo+facultad)',
      domain: 'productivity',
      unit: 'min',
    },
    { id: 'steps', label: 'Pasos', domain: 'health', unit: '' },
  ];
  return defs.map((def) => ({
    ...def,
    values: days.map((date) => pickers[def.id](date)),
    dates: [...days],
  }));
}

function relationSummary(
  labelX: string,
  labelY: string,
  result: ReturnType<typeof spearmanFromPairs>,
): string {
  if (result.rho === null) {
    return `No hay suficientes días coincidentes para analizar ${labelX.toLowerCase()} y ${labelY.toLowerCase()} (${result.n} pares).`;
  }
  const dir =
    result.direction === 'positive'
      ? 'positiva'
      : result.direction === 'negative'
        ? 'negativa'
        : 'nula';
  return `Se observa una asociación ${dir} ${result.strengthLabel} (ρ=${result.rho}, n=${result.n}) entre ${labelX.toLowerCase()} y ${labelY.toLowerCase()} en los días con datos coincidentes. ${result.causalityDisclaimer}`;
}

function buildRelations(
  days: readonly string[],
  series: Record<string, Map<string, number>>,
): VariableRelation[] {
  const defs: { id: string; x: string; y: string; labelX: string; labelY: string }[] = [
    { id: 'sleep-energy', x: 'sleep', y: 'energy', labelX: 'Sueño', labelY: 'Energía' },
    { id: 'sleep-work', x: 'sleep', y: 'work', labelX: 'Sueño', labelY: 'Trabajo' },
    { id: 'sleep-faculty', x: 'sleep', y: 'faculty', labelX: 'Sueño', labelY: 'Facultad' },
    { id: 'sleep-leisure', x: 'sleep', y: 'leisure', labelX: 'Sueño', labelY: 'Ocio' },
    {
      id: 'sleep-habits',
      x: 'sleep',
      y: 'habits',
      labelX: 'Sueño',
      labelY: 'Cumplimiento de hábitos',
    },
    {
      id: 'energy-habits',
      x: 'energy',
      y: 'habits',
      labelX: 'Energía',
      labelY: 'Cumplimiento de hábitos',
    },
    { id: 'steps-energy', x: 'steps', y: 'energy', labelX: 'Pasos', labelY: 'Energía' },
    { id: 'training-sleep', x: 'training', y: 'sleep', labelX: 'Entrenamiento', labelY: 'Sueño' },
    {
      id: 'training-energy',
      x: 'training',
      y: 'energy',
      labelX: 'Entrenamiento',
      labelY: 'Energía',
    },
    {
      id: 'habits-work-faculty',
      x: 'habits',
      y: 'workFaculty',
      labelX: 'Cumplimiento de hábitos',
      labelY: 'Trabajo/Facultad',
    },
  ];

  return defs.map((def) => {
    const pairs = alignByDate(series[def.x], series[def.y]);
    const result = spearmanFromPairs(pairs);
    return {
      id: def.id,
      labelX: def.labelX,
      labelY: def.labelY,
      pairs: pairs.length,
      result,
      summary: relationSummary(def.labelX, def.labelY, result),
    };
  });
}

function buildWeekdayPatterns(
  days: readonly string[],
  pickers: {
    sleep: (d: string) => number | null;
    habits: (d: string) => number | null;
    work: (d: string) => number | null;
    faculty: (d: string) => number | null;
    energy: (d: string) => number | null;
  },
): WeekdayPatterns {
  const buckets: {
    sleep: number[];
    habits: number[];
    work: number[];
    faculty: number[];
    energy: number[];
  }[] = Array.from({ length: 7 }, () => ({
    sleep: [],
    habits: [],
    work: [],
    faculty: [],
    energy: [],
  }));

  for (const date of days) {
    const idx = weekdayMondayIndex(date);
    const s = pickers.sleep(date);
    const h = pickers.habits(date);
    const w = pickers.work(date);
    const f = pickers.faculty(date);
    const e = pickers.energy(date);
    if (s !== null) buckets[idx].sleep.push(s);
    if (h !== null) buckets[idx].habits.push(h);
    if (w !== null) buckets[idx].work.push(w);
    if (f !== null) buckets[idx].faculty.push(f);
    if (e !== null) buckets[idx].energy.push(e);
  }

  const rows: WeekdayPatternRow[] = buckets.map((bucket, weekday) => {
    const observations = Math.max(
      bucket.sleep.length,
      bucket.habits.length,
      bucket.work.length,
      bucket.faculty.length,
      bucket.energy.length,
    );
    const sleepAvg = averageOf(bucket.sleep);
    const habitRate = averageOf(bucket.habits);
    const workAvg = averageOf(bucket.work);
    const facultyAvg = averageOf(bucket.faculty);
    const energyAvg = averageOf(bucket.energy);
    return {
      weekday,
      label: WEEKDAY_LABELS[weekday],
      observations,
      sleepAvg,
      sleepLabel: formatHours(sleepAvg),
      habitRate,
      habitLabel: formatRate(habitRate),
      workAvg,
      workLabel: formatMinutes(workAvg),
      facultyAvg,
      facultyLabel: formatMinutes(facultyAvg),
      energyAvg,
      energyLabel: formatEnergy(energyAvg),
      sparse: observations > 0 && observations < 3,
    };
  });

  const ranked = rows.filter((row) => row.habitRate !== null && row.observations >= 3);
  let bestDayLabel: string | null = null;
  let worstDayLabel: string | null = null;
  let notice: string | null = null;
  if (ranked.length === 0) {
    notice =
      'Todavía no hay una muestra mínima razonable por día de la semana para destacar mejores y peores días.';
  } else {
    const sorted = [...ranked].sort((a, b) => (b.habitRate as number) - (a.habitRate as number));
    bestDayLabel = sorted[0].label;
    worstDayLabel = sorted[sorted.length - 1].label;
    if (ranked.some((row) => row.sparse)) {
      notice = 'Algunos días de la semana tienen pocas observaciones; comparalos con prudencia.';
    }
  }

  return { rows, bestDayLabel, worstDayLabel, notice };
}

export function buildTrendsPageData(input: {
  registro: readonly RegistroRecord[];
  salud: readonly SaludRecord[];
  today: string;
  window: PeriodWindow;
  source: 'mock' | 'google';
  status: TodayStatus;
  notice: string | null;
}): TrendsPageData {
  const { window, today } = input;
  const prevWindow = previousPeriodWindow(window);
  const regMap = byDateRegistro(input.registro);
  const saludMap = byDateSalud(input.salud);
  const days = eachDay(window, today);
  const prevDays = eachDay(prevWindow, today);

  const pickSleep = (date: string) => sleepHours(regMap.get(date), saludMap.get(date));
  const pickEnergy = (date: string) => num(regMap.get(date)?.energy);
  const pickHabits = (date: string) => dailyHabitRate(regMap.get(date), date, today);
  const pickWork = (date: string) => num(regMap.get(date)?.work);
  const pickFaculty = (date: string) => num(regMap.get(date)?.faculty);
  const pickLeisure = (date: string) => num(regMap.get(date)?.leisure);
  const pickVida2 = (date: string) => num(regMap.get(date)?.vida2);
  const pickPc = (date: string) => num(regMap.get(date)?.pcActive);
  const pickSteps = (date: string) => num(saludMap.get(date)?.steps);
  const pickHr = (date: string) => num(saludMap.get(date)?.restingHr);
  const pickTraining = (date: string) => trainingScore(regMap.get(date), saludMap.get(date));
  const pickWorkFaculty = (date: string) => {
    const w = pickWork(date);
    const f = pickFaculty(date);
    if (w === null && f === null) return null;
    return (w ?? 0) + (f ?? 0);
  };
  const pickProductivity = pickWorkFaculty;

  const coverage = buildCoverage(input.registro, input.salud, window, today, window.days);

  const weeklyAvg = weeklyGoalAverage(regMap, window, today);
  const weeklyAvgPrev = weeklyGoalAverage(regMap, prevWindow, today);

  const summary = buildSummary(days, prevDays, {
    habitRate: pickHabits,
    sleep: pickSleep,
    steps: pickSteps,
    restingHr: pickHr,
    work: pickWork,
    faculty: pickFaculty,
    vida2: pickVida2,
    leisure: pickLeisure,
    pcActive: pickPc,
    weeklyGym: weeklyAvg ?? 0,
    weeklyGymPrev: weeklyAvgPrev,
  });

  const evolution = buildEvolution(days, {
    sleep: pickSleep,
    energy: pickEnergy,
    habits: pickHabits,
    productivity: pickProductivity,
    steps: pickSteps,
  });

  const seriesMaps = {
    sleep: mapSeries(days, pickSleep),
    energy: mapSeries(days, pickEnergy),
    habits: mapSeries(days, pickHabits),
    work: mapSeries(days, pickWork),
    faculty: mapSeries(days, pickFaculty),
    leisure: mapSeries(days, pickLeisure),
    steps: mapSeries(days, pickSteps),
    training: mapSeries(days, pickTraining),
    workFaculty: mapSeries(days, pickWorkFaculty),
  };

  const relations = buildRelations(days, seriesMaps);
  const weekday = buildWeekdayPatterns(days, {
    sleep: pickSleep,
    habits: pickHabits,
    work: pickWork,
    faculty: pickFaculty,
    energy: pickEnergy,
  });

  const quality: DataQualityReport = {
    habitsDays: coverage.habitsDays,
    healthDays: coverage.healthDays,
    productivityDays: coverage.productivityDays,
    partialHealthDays: coverage.partialHealthDays,
    daysWithoutAny: coverage.daysWithoutData,
    relationPairCounts: relations.map((rel) => ({
      id: rel.id,
      label: `${rel.labelX} vs ${rel.labelY}`,
      pairs: rel.pairs,
    })),
  };

  const notice = [input.notice, coverage.notice].filter(Boolean).join(' ') || null;

  return {
    source: input.source,
    status: input.status,
    notice,
    targetDate: today,
    periodDays: window.days,
    periodStart: window.start,
    periodEnd: window.end,
    coverage,
    summary,
    evolution,
    relations,
    weekday,
    quality,
  };
}

/** Export auxiliar para tests de alineación. */
export function alignSeriesForTest(
  left: ReadonlyMap<string, number>,
  right: ReadonlyMap<string, number>,
): AlignedPair[] {
  return alignByDate(left, right);
}
