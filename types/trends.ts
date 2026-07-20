/**
 * Contratos de Tendencias y Análisis determinístico (Fase 3B).
 */
import type { PeriodCompare } from '@/lib/adapters/compare';
import type {
  AssociationStrength,
  SampleConfidence,
  SpearmanResult,
} from '@/lib/adapters/correlation';
import type { PeriodDays } from '@/lib/periods';
import type { Domain, TodayStatus } from '@/types';

export interface TrendsCoverage {
  habitsDays: number;
  healthDays: number;
  productivityDays: number;
  partialHealthDays: number;
  daysWithoutData: number;
  periodDays: PeriodDays;
  insufficientSample: boolean;
  notice: string | null;
}

export interface TrendMetricSummary {
  id: string;
  label: string;
  domain: Domain;
  unit: string;
  /** Valor actual formateado (nunca Infinity/NaN). */
  currentLabel: string;
  previousLabel: string;
  /** Diferencia absoluta formateada o "Sin comparación". */
  deltaLabel: string;
  compare: PeriodCompare;
  coverageLabel: string;
  /** null si no hay dato numérico. */
  currentValue: number | null;
  previousValue: number | null;
}

export interface TrendSeries {
  id: string;
  label: string;
  domain: Domain;
  unit: string;
  /** oldest → newest; null = sin dato ese día (no cero inventado). */
  values: (number | null)[];
  dates: string[];
}

export interface VariableRelation {
  id: string;
  labelX: string;
  labelY: string;
  pairs: number;
  result: SpearmanResult;
  summary: string;
}

export interface WeekdayPatternRow {
  weekday: number;
  label: string;
  observations: number;
  sleepAvg: number | null;
  sleepLabel: string;
  habitRate: number | null;
  habitLabel: string;
  workAvg: number | null;
  workLabel: string;
  facultyAvg: number | null;
  facultyLabel: string;
  energyAvg: number | null;
  energyLabel: string;
  sparse: boolean;
}

export interface WeekdayPatterns {
  rows: WeekdayPatternRow[];
  bestDayLabel: string | null;
  worstDayLabel: string | null;
  notice: string | null;
}

export interface DataQualityReport {
  habitsDays: number;
  healthDays: number;
  productivityDays: number;
  partialHealthDays: number;
  daysWithoutAny: number;
  relationPairCounts: { id: string; label: string; pairs: number }[];
}

export interface TrendsPageData {
  source: 'mock' | 'google';
  status: TodayStatus;
  notice: string | null;
  targetDate: string;
  periodDays: PeriodDays;
  periodStart: string;
  periodEnd: string;
  coverage: TrendsCoverage;
  summary: TrendMetricSummary[];
  evolution: TrendSeries[];
  relations: VariableRelation[];
  weekday: WeekdayPatterns;
  quality: DataQualityReport;
}

export interface AnalysisObservation {
  id: string;
  text: string;
}

export interface AnalysisReport {
  source: 'mock' | 'google';
  status: TodayStatus;
  notice: string | null;
  targetDate: string;
  periodDays: PeriodDays;
  periodStart: string;
  periodEnd: string;
  title: string;
  coverage: TrendsCoverage;
  sections: {
    general: string[];
    habits: string[];
    health: string[];
    productivity: string[];
    associations: string[];
    comparison: string[];
    limitations: string[];
    questions: string[];
  };
  observations: AnalysisObservation[];
  /** Texto plano listo para copiar a ChatGPT. */
  plainText: string;
  /** Resumen corto para la UI. */
  highlights: string[];
}

export type { AssociationStrength, SampleConfidence, SpearmanResult };
