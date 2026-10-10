/** Fail-closed data boundary for PAS-derived Professional Intelligence visualizations. */
export const VISUAL_PANEL_IDS = [
  'V01',
  'V02',
  'V03',
  'V04',
  'V05',
  'V06',
  'V07',
  'V08',
  'V09',
  'V10',
  'V11',
  'V12',
  'V13',
  'V14',
  'V15',
  'V16',
  'V17',
  'V18',
  'V19',
] as const;

export type VisualPanelId = (typeof VISUAL_PANEL_IDS)[number];
export type VisualPanelState =
  | 'AVAILABLE'
  | 'PARTIAL_COMPARISON'
  | 'STALE'
  | 'NON_COMPARABLE'
  | 'INSUFFICIENT_EVIDENCE'
  | 'HELD';
export type VisualMetricKind =
  'EMPLOYMENT_GROWTH_PERCENT' | 'NET_NEW_JOBS' | 'ANNUAL_OPENINGS' | 'MEDIAN_GROSS_MONTHLY_SALARY';
export type VisualGeography =
  | 'US_BENCHMARK'
  | 'ARGENTINA_LOCAL'
  | 'ARGENTINA_DOLLARIZED_REMOTE'
  | 'LATAM_REMOTE'
  | 'INTERNATIONAL_REMOTE';
export type VisualHorizon = 'OFFICIAL_2025_2035' | 'HISTORICAL_SURVEY';

export interface VisualMetric {
  id: string;
  label: string;
  kind: VisualMetricKind;
  value: number;
  unit: 'PERCENT' | 'JOBS' | 'JOBS_PER_YEAR' | 'ARS_GROSS_MONTHLY';
  geography: VisualGeography;
  horizon: VisualHorizon;
  period: string;
  roleId: string;
  occupationCode: string | null;
  seniority: string | null;
  dollarized: boolean | null;
  sampleSize: number | null;
  sourceId: string;
}

export interface VisualSource {
  id: string;
  label: string;
  url: string;
  observedAt: string;
  reviewAfterDays: number;
  kind: 'OFFICIAL_STATISTICS' | 'WORKFORCE_SURVEY';
}

export interface VisualPanel {
  id: VisualPanelId;
  state: VisualPanelState;
  reason: string | null;
  metrics: VisualMetric[];
}

export interface ProfessionalVisualizationSnapshot {
  schemaVersion: 1;
  kind: 'professional_visualization_snapshot';
  source: {
    repository: 'franciscovitar/personal-ai-system';
    ref: 'main';
    commit: string;
    canonicalRefs: string[];
    generatedAt: string;
  };
  sources: VisualSource[];
  panels: VisualPanel[];
}

const PANEL_IDS = new Set<string>(VISUAL_PANEL_IDS);
const PANEL_STATES = new Set<string>([
  'AVAILABLE',
  'PARTIAL_COMPARISON',
  'STALE',
  'NON_COMPARABLE',
  'INSUFFICIENT_EVIDENCE',
  'HELD',
]);
const GEOGRAPHIES = new Set<string>([
  'US_BENCHMARK',
  'ARGENTINA_LOCAL',
  'ARGENTINA_DOLLARIZED_REMOTE',
  'LATAM_REMOTE',
  'INTERNATIONAL_REMOTE',
]);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function string(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function number(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function date(value: unknown): value is string {
  if (!string(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validPasRef(value: unknown): boolean {
  return string(value) && value.startsWith('AI/projects/professional-intelligence/');
}

function validMetric(value: unknown): value is VisualMetric {
  if (!record(value)) return false;

  if (
    !string(value.id) ||
    !string(value.label) ||
    !number(value.value) ||
    !GEOGRAPHIES.has(String(value.geography)) ||
    !string(value.period) ||
    !string(value.roleId) ||
    !string(value.sourceId) ||
    (value.occupationCode !== null && !string(value.occupationCode)) ||
    (value.seniority !== null && !string(value.seniority)) ||
    (value.sampleSize !== null &&
      (!Number.isInteger(value.sampleSize) || Number(value.sampleSize) < 1)) ||
    (value.dollarized !== null && typeof value.dollarized !== 'boolean')
  ) {
    return false;
  }

  if (
    value.kind === 'EMPLOYMENT_GROWTH_PERCENT' ||
    value.kind === 'NET_NEW_JOBS' ||
    value.kind === 'ANNUAL_OPENINGS'
  ) {
    if (
      value.geography !== 'US_BENCHMARK' ||
      value.horizon !== 'OFFICIAL_2025_2035' ||
      value.period !== '2025-2035' ||
      value.sampleSize !== null ||
      value.seniority !== null ||
      value.dollarized !== null ||
      typeof value.occupationCode !== 'string' ||
      !/^\d{2}-\d{4}$/.test(value.occupationCode)
    ) {
      return false;
    }

    if (value.kind === 'EMPLOYMENT_GROWTH_PERCENT') {
      return value.unit === 'PERCENT' && value.value >= -100;
    }
    if (value.kind === 'NET_NEW_JOBS') {
      return value.unit === 'JOBS' && Number.isInteger(value.value);
    }
    return value.unit === 'JOBS_PER_YEAR' && Number.isInteger(value.value) && value.value >= 0;
  }

  if (value.kind === 'MEDIAN_GROSS_MONTHLY_SALARY') {
    return (
      (value.geography === 'ARGENTINA_LOCAL' ||
        value.geography === 'ARGENTINA_DOLLARIZED_REMOTE') &&
      value.horizon === 'HISTORICAL_SURVEY' &&
      value.unit === 'ARS_GROSS_MONTHLY' &&
      value.occupationCode === null &&
      string(value.seniority) &&
      Number.isInteger(value.sampleSize) &&
      Number(value.sampleSize) >= 1 &&
      typeof value.dollarized === 'boolean' &&
      value.value >= 0
    );
  }
  return false;
}

/** Never compare different units, populations, periods, cohorts or data methodologies. */
export function canCompareVisualMetrics(a: VisualMetric, b: VisualMetric): boolean {
  if (!validMetric(a) || !validMetric(b)) return false;
  return (
    a.kind === b.kind &&
    a.unit === b.unit &&
    a.geography === b.geography &&
    a.horizon === b.horizon &&
    a.period === b.period &&
    a.sourceId === b.sourceId &&
    a.seniority === b.seniority &&
    a.dollarized === b.dollarized
  );
}

/** Reject contradictory and untraceable inputs rather than inventing fallback numbers. */
export function parseProfessionalVisualizationSnapshot(
  value: unknown,
): ProfessionalVisualizationSnapshot | null {
  if (!record(value)) return null;
  const origin = value.source;
  if (
    value.schemaVersion !== 1 ||
    value.kind !== 'professional_visualization_snapshot' ||
    !record(origin) ||
    origin.repository !== 'franciscovitar/personal-ai-system' ||
    origin.ref !== 'main' ||
    !string(origin.commit) ||
    !/^[a-f0-9]{40}$/.test(origin.commit) ||
    !date(origin.generatedAt) ||
    !Array.isArray(origin.canonicalRefs) ||
    origin.canonicalRefs.length === 0 ||
    !origin.canonicalRefs.every(validPasRef) ||
    !Array.isArray(value.sources) ||
    !Array.isArray(value.panels)
  ) {
    return null;
  }

  const sources = value.sources as unknown[];
  const sourceIds = new Set<string>();
  for (const source of sources) {
    if (
      !record(source) ||
      !string(source.id) ||
      sourceIds.has(source.id) ||
      !string(source.label) ||
      !string(source.url) ||
      !source.url.startsWith('https://') ||
      !date(source.observedAt) ||
      !Number.isInteger(source.reviewAfterDays) ||
      Number(source.reviewAfterDays) < 1 ||
      !['OFFICIAL_STATISTICS', 'WORKFORCE_SURVEY'].includes(String(source.kind))
    ) {
      return null;
    }
    sourceIds.add(source.id);
  }

  const panelIds = new Set<string>();
  const metricIds = new Set<string>();
  for (const panel of value.panels) {
    if (
      !record(panel) ||
      !PANEL_IDS.has(String(panel.id)) ||
      panelIds.has(String(panel.id)) ||
      !PANEL_STATES.has(String(panel.state)) ||
      (panel.reason !== null && !string(panel.reason)) ||
      !Array.isArray(panel.metrics) ||
      (panel.state === 'AVAILABLE' && panel.metrics.length === 0) ||
      (panel.state !== 'AVAILABLE' && panel.reason === null)
    ) {
      return null;
    }

    panelIds.add(String(panel.id));
    for (const metric of panel.metrics) {
      if (!validMetric(metric) || metricIds.has(metric.id) || !sourceIds.has(metric.sourceId)) {
        return null;
      }
      metricIds.add(metric.id);
      const source = sources.find((item) => record(item) && item.id === metric.sourceId);
      if (!record(source)) return null;
      if (
        (metric.kind === 'MEDIAN_GROSS_MONTHLY_SALARY' && source.kind !== 'WORKFORCE_SURVEY') ||
        (metric.kind !== 'MEDIAN_GROSS_MONTHLY_SALARY' && source.kind !== 'OFFICIAL_STATISTICS')
      ) {
        return null;
      }
    }
  }
  return value as unknown as ProfessionalVisualizationSnapshot;
}

/** Review dates are not permission to present old salaries as today's offers. */
export function isVisualSourceReviewDue(source: VisualSource, now = new Date()): boolean {
  if (
    !date(source.observedAt) ||
    !Number.isInteger(source.reviewAfterDays) ||
    source.reviewAfterDays < 1
  ) {
    return true;
  }
  const observed = new Date(source.observedAt + 'T00:00:00Z').getTime();
  const elapsed = now.getTime() - observed;
  return (
    !Number.isFinite(elapsed) ||
    elapsed < 0 ||
    elapsed > source.reviewAfterDays * 24 * 60 * 60 * 1000
  );
}
