import 'server-only';

import type { PlainCell } from '@/lib/data/plain';
import type { ReadTabResult, SheetReadCode } from '@/lib/google/errors';

import { NUTRIENT_CATALOG, nutrientCatalogEntry } from './nutrient-catalog';
import { readNutritionTabValues } from './sheets-read';
import type {
  NutritionAiInsight,
  NutritionCoverage,
  NutritionDashboardData,
  NutritionDailyPoint,
  NutritionEstimateQuality,
  NutritionMacroProgress,
  NutritionMealSummary,
  NutritionNutrientValue,
  NutritionTarget,
  NutrientGroup,
} from './types';

type Row = Record<string, PlainCell>;

const REQUIRED_TABS = ['Daily Summary', 'Meals', 'Food Items', 'Targets'] as const;
const OPTIONAL_TABS = ['Nutrient Targets', 'Nutrient Summary', 'AI Insights'] as const;

function cordobaToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Cordoba',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function rowsFrom(result: ReadTabResult): Row[] {
  if (!result.ok || result.values.length === 0) return [];
  const headers = result.values[0]!.map((cell) => String(cell ?? '').trim());
  return result.values.slice(1).map((cells) => {
    const row: Row = {};
    headers.forEach((header, index) => {
      if (header) row[header] = cells[index] ?? null;
    });
    return row;
  });
}

function stringValue(value: PlainCell): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function numberValue(value: PlainCell): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function coverageValue(value: PlainCell): NutritionCoverage {
  const normalized = stringValue(value)?.toLowerCase();
  return normalized === 'complete' ||
    normalized === 'partial' ||
    normalized === 'none' ||
    normalized === 'unknown'
    ? normalized
    : 'unknown';
}

function qualityValue(value: PlainCell): NutritionEstimateQuality {
  const normalized = stringValue(value)?.toLowerCase();
  return normalized === 'high' ||
    normalized === 'medium' ||
    normalized === 'low' ||
    normalized === 'mixed' ||
    normalized === 'unknown'
    ? normalized
    : 'unknown';
}

function confidenceValue(value: PlainCell): 'high' | 'medium' | 'low' | 'mixed' | 'unknown' {
  const normalized = stringValue(value)?.toLowerCase();
  return normalized === 'high' ||
    normalized === 'medium' ||
    normalized === 'low' ||
    normalized === 'mixed' ||
    normalized === 'unknown'
    ? normalized
    : 'unknown';
}

function activeRows(rows: readonly Row[]): Row[] {
  return rows.filter((row) => (stringValue(row.status)?.toLowerCase() ?? 'active') === 'active');
}

function aggregateConfidence(
  values: readonly ('high' | 'medium' | 'low' | 'mixed' | 'unknown')[],
): 'high' | 'medium' | 'low' | 'mixed' | 'unknown' {
  if (values.length === 0) return 'unknown';
  const unique = new Set(values);
  if (unique.size === 1) return values[0]!;
  if (unique.has('mixed') || unique.has('unknown')) return 'mixed';
  if (unique.has('low')) return 'mixed';
  if (unique.has('medium')) return 'medium';
  return 'high';
}

function chooseTarget(rows: readonly Row[], today: string): NutritionTarget | null {
  const eligible = activeRows(rows)
    .filter((row) => {
      const from = stringValue(row.effectiveFrom);
      const to = stringValue(row.effectiveTo);
      return Boolean(from && from <= today && (!to || to >= today));
    })
    .sort((a, b) =>
      (stringValue(b.effectiveFrom) ?? '').localeCompare(stringValue(a.effectiveFrom) ?? ''),
    );

  const row = eligible[0];
  if (!row) return null;
  return {
    decisionId: stringValue(row.decisionId) ?? 'target',
    effectiveFrom: stringValue(row.effectiveFrom) ?? today,
    goal: stringValue(row.goal),
    energyKcal: numberValue(row.energyTargetKcal),
    proteinGrams: numberValue(row.proteinTargetGrams),
    carbohydrateGrams: numberValue(row.carbohydrateTargetGrams),
    fatGrams: numberValue(row.fatTargetGrams),
    fiberGrams: numberValue(row.fiberTargetGrams),
  };
}

function chooseNutrientTargets(rows: readonly Row[], today: string): Map<string, Row> {
  const eligible = activeRows(rows)
    .filter((row) => {
      const from = stringValue(row.effectiveFrom);
      const to = stringValue(row.effectiveTo);
      return Boolean(from && from <= today && (!to || to >= today));
    })
    .sort((a, b) =>
      (stringValue(b.effectiveFrom) ?? '').localeCompare(stringValue(a.effectiveFrom) ?? ''),
    );

  const byKey = new Map<string, Row>();
  for (const row of eligible) {
    const key = stringValue(row.nutrientKey);
    if (key && !byKey.has(key)) byKey.set(key, row);
  }
  return byKey;
}

function parseDailyRows(rows: readonly Row[]): NutritionDailyPoint[] {
  return rows
    .map((row) => {
      const date = stringValue(row.date);
      if (!date) return null;
      return {
        date,
        energyKcal: numberValue(row.energyKcal),
        energyKcalLow: numberValue(row.energyKcalLow),
        energyKcalHigh: numberValue(row.energyKcalHigh),
        estimateQuality: qualityValue(row.estimateQuality),
        energyCoverage: coverageValue(row.energyCoverage),
        macroCoverage: coverageValue(row.macroCoverage),
        trackedMealCount: numberValue(row.trackedMealCount) ?? 0,
        lowConfidenceItemCount: numberValue(row.lowConfidenceItemCount) ?? 0,
      } satisfies NutritionDailyPoint;
    })
    .filter((row): row is NutritionDailyPoint => row !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function macroFromItems(input: {
  key: NutritionMacroProgress['key'];
  label: string;
  column: string;
  target: number | null;
  items: readonly Row[];
}): NutritionMacroProgress {
  const active = activeRows(input.items);
  const values = active.map((row) => numberValue(row[input.column]));
  const known = values.filter((value): value is number => value !== null);
  return {
    key: input.key,
    label: input.label,
    amount: known.length > 0 ? known.reduce((sum, value) => sum + value, 0) : null,
    target: input.target,
    unit: 'g',
    coverage:
      active.length === 0
        ? 'none'
        : known.length === active.length
          ? 'complete'
          : known.length > 0
            ? 'partial'
            : 'none',
    knownItemCount: known.length,
    totalItemCount: active.length,
  };
}

function mealTimeLabel(timestamp: string | null): string | null {
  if (!timestamp) return null;
  const match = timestamp.match(/T(\d{2}:\d{2})/);
  return match?.[1] ?? null;
}

function sumEnergy(items: readonly Row[]): {
  central: number | null;
  low: number | null;
  high: number | null;
} {
  if (items.length === 0) return { central: null, low: null, high: null };
  let central = 0;
  let low = 0;
  let high = 0;
  let centralComplete = true;
  let rangeKnown = false;

  for (const item of items) {
    const c = numberValue(item.energyKcal);
    const l = numberValue(item.energyKcalLow);
    const h = numberValue(item.energyKcalHigh);
    if (c === null) centralComplete = false;
    else central += c;
    if (l !== null || c !== null) {
      low += l ?? c ?? 0;
      rangeKnown = true;
    }
    if (h !== null || c !== null) high += h ?? c ?? 0;
  }

  return {
    central: centralComplete ? central : null,
    low: rangeKnown ? low : null,
    high: rangeKnown ? high : null,
  };
}

function buildMeals(
  mealRows: readonly Row[],
  itemRows: readonly Row[],
  today: string,
): NutritionMealSummary[] {
  const meals = activeRows(mealRows).filter((row) => stringValue(row.date) === today);
  const activeItems = activeRows(itemRows);
  return meals
    .map((meal) => {
      const mealId = stringValue(meal.mealId);
      if (!mealId) return null;
      const items = activeItems.filter((item) => stringValue(item.mealId) === mealId);
      const foodNames = items
        .map((item) => stringValue(item.foodName))
        .filter((name): name is string => Boolean(name));
      const energy = sumEnergy(items);
      const source = stringValue(meal.sourceText);
      const title =
        foodNames.length > 0
          ? foodNames.slice(0, 3).join(' · ')
          : (source?.split('\n')[0] ?? 'Comida');
      return {
        mealId,
        mealType: stringValue(meal.mealType) ?? 'unknown',
        timeLabel: mealTimeLabel(stringValue(meal.timestamp)),
        title,
        foodNames,
        energyKcal: energy.central,
        energyKcalLow: energy.low,
        energyKcalHigh: energy.high,
        confidence: aggregateConfidence(items.map((item) => confidenceValue(item.confidence))),
      } as NutritionMealSummary;
    })
    .filter((meal): meal is NutritionMealSummary => meal !== null)
    .sort((a, b) => (a.timeLabel ?? '99:99').localeCompare(b.timeLabel ?? '99:99'));
}

function nutrientGroup(value: PlainCell, fallback: NutrientGroup): NutrientGroup {
  const normalized = stringValue(value)?.toLowerCase();
  return normalized === 'vitamin' || normalized === 'mineral' || normalized === 'other'
    ? normalized
    : fallback;
}

function buildNutrients(
  result: ReadTabResult,
  targetResult: ReadTabResult,
  todayItems: readonly Row[],
  today: string,
): NutritionNutrientValue[] {
  const rows = rowsFrom(result).filter((row) => stringValue(row.date) === today);
  const byKey = new Map(rows.map((row) => [stringValue(row.nutrientKey) ?? '', row]));
  const targetByKey = chooseNutrientTargets(rowsFrom(targetResult), today);

  const activeItems = activeRows(todayItems);
  const derivedKnown = (column: string) => {
    const values = activeItems.map((item) => numberValue(item[column]));
    const known = values.filter((value): value is number => value !== null);
    return {
      amount: known.length > 0 ? known.reduce((sum, value) => sum + value, 0) : null,
      coverage:
        activeItems.length === 0
          ? ('none' as const)
          : known.length === activeItems.length
            ? ('complete' as const)
            : known.length > 0
              ? ('partial' as const)
              : ('none' as const),
    };
  };

  return NUTRIENT_CATALOG.map((catalog) => {
    const row = byKey.get(catalog.key);
    const targetRow = targetByKey.get(catalog.key);
    const targetAmount = numberValue(targetRow?.targetAmount ?? null);
    const lowerTarget = numberValue(targetRow?.lowerTarget ?? null);
    const upperTarget = numberValue(targetRow?.upperTarget ?? null);
    const targetUnit = stringValue(targetRow?.unit ?? null);
    const targetNotes = stringValue(targetRow?.notes ?? null);

    if (row) {
      return {
        key: catalog.key,
        name: stringValue(row.nutrientName) ?? catalog.name,
        group: nutrientGroup(row.group, catalog.group),
        amount: numberValue(row.amount),
        unit: stringValue(row.unit) ?? targetUnit ?? catalog.unit,
        target: targetAmount ?? numberValue(row.targetAmount ?? row.target),
        lowerTarget: lowerTarget ?? numberValue(row.lowerTarget),
        upperTarget: upperTarget ?? numberValue(row.upperTarget),
        confidence: confidenceValue(row.confidence),
        sourceCoverage: coverageValue(row.sourceCoverage ?? row.coverage),
        notes: stringValue(row.notes) ?? targetNotes,
      } satisfies NutritionNutrientValue;
    }

    if (catalog.key === 'sodium') {
      const derived = derivedKnown('sodiumMg');
      return {
        key: catalog.key,
        name: catalog.name,
        group: catalog.group,
        amount: derived.amount,
        unit: targetUnit ?? catalog.unit,
        target: targetAmount,
        lowerTarget,
        upperTarget,
        confidence: derived.amount === null ? 'unknown' : 'mixed',
        sourceCoverage: derived.coverage,
        notes:
          derived.amount === null
            ? targetNotes
            : 'Subtotal conocido derivado de Food Items; la referencia proviene de Nutrient Targets.',
      };
    }

    if (catalog.key === 'fiber') {
      const derived = derivedKnown('fiberGrams');
      return {
        key: catalog.key,
        name: catalog.name,
        group: catalog.group,
        amount: derived.amount,
        unit: targetUnit ?? catalog.unit,
        target: targetAmount,
        lowerTarget,
        upperTarget,
        confidence: derived.amount === null ? 'unknown' : 'mixed',
        sourceCoverage: derived.coverage,
        notes:
          derived.amount === null
            ? targetNotes
            : 'Subtotal conocido derivado de Food Items; la referencia proviene de Nutrient Targets.',
      };
    }

    return {
      key: catalog.key,
      name: catalog.name,
      group: catalog.group,
      amount: null,
      unit: targetUnit ?? catalog.unit,
      target: targetAmount,
      lowerTarget,
      upperTarget,
      confidence: 'unknown',
      sourceCoverage: 'none',
      notes: targetNotes,
    };
  });
}

function parseAiInsights(result: ReadTabResult, today: string): NutritionAiInsight[] {
  if (!result.ok) return [];
  const rows = activeRows(rowsFrom(result))
    .filter((row) => {
      const date = stringValue(row.date);
      return !date || date <= today;
    })
    .sort((a, b) =>
      (stringValue(b.createdAt) ?? stringValue(b.date) ?? '').localeCompare(
        stringValue(a.createdAt) ?? stringValue(a.date) ?? '',
      ),
    );

  const seen = new Set<string>();
  const insights: NutritionAiInsight[] = [];
  for (const row of rows) {
    const rawCategory = stringValue(row.category)?.toLowerCase();
    const category =
      rawCategory === 'antioxidants' ||
      rawCategory === 'anti-inflammatory' ||
      rawCategory === 'improvement' ||
      rawCategory === 'pattern'
        ? rawCategory
        : null;
    if (!category || seen.has(category)) continue;
    const title = stringValue(row.title);
    const detail = stringValue(row.detail);
    if (!title || !detail) continue;
    const rawTone = stringValue(row.tone)?.toLowerCase();
    const tone =
      rawTone === 'positive' || rawTone === 'watch' || rawTone === 'neutral' ? rawTone : 'neutral';
    insights.push({
      id: stringValue(row.insightId) ?? `${category}:${stringValue(row.date) ?? 'latest'}`,
      category,
      tone,
      title,
      detail,
      evidence: stringValue(row.evidence),
      window: stringValue(row.window),
    });
    seen.add(category);
  }
  return insights;
}

function failurePriority(results: readonly ReadTabResult[]): SheetReadCode | null {
  const codes = results.filter((result) => !result.ok).map((result) => result.code);
  if (codes.includes('auth-error')) return 'auth-error';
  if (codes.includes('permission-error')) return 'permission-error';
  if (codes.includes('not-configured')) return 'not-configured';
  if (codes.includes('read-error')) return 'read-error';
  if (codes.includes('missing-tab')) return 'missing-tab';
  return null;
}

function optionalStatus(result: ReadTabResult): 'ready' | 'missing' | 'unavailable' {
  if (result.ok) return 'ready';
  return result.code === 'missing-tab' ? 'missing' : 'unavailable';
}

export async function loadNutritionDashboardData(
  now = new Date(),
): Promise<NutritionDashboardData> {
  const today = cordobaToday(now);
  const [
    dailyResult,
    mealsResult,
    itemsResult,
    targetsResult,
    nutrientTargetsResult,
    nutrientResult,
    insightsResult,
  ] = await Promise.all([
    readNutritionTabValues(REQUIRED_TABS[0]),
    readNutritionTabValues(REQUIRED_TABS[1]),
    readNutritionTabValues(REQUIRED_TABS[2]),
    readNutritionTabValues(REQUIRED_TABS[3]),
    readNutritionTabValues(OPTIONAL_TABS[0]),
    readNutritionTabValues(OPTIONAL_TABS[1]),
    readNutritionTabValues(OPTIONAL_TABS[2]),
  ]);

  const required = [dailyResult, mealsResult, itemsResult, targetsResult];
  const failure = failurePriority(required);
  const allUnavailable = required.every((result) => !result.ok);
  const sourceStatus = allUnavailable ? 'unavailable' : failure ? 'partial' : 'ready';

  const dailyRows = rowsFrom(dailyResult);
  const mealRows = rowsFrom(mealsResult);
  const itemRows = rowsFrom(itemsResult);
  const targetRows = rowsFrom(targetsResult);
  const target = chooseTarget(targetRows, today);
  const history = parseDailyRows(dailyRows)
    .filter((row) => row.date <= today)
    .slice(-14);
  const todayDaily = history.find((row) => row.date === today) ?? null;
  const todayMealIds = new Set(
    activeRows(mealRows)
      .filter((row) => stringValue(row.date) === today)
      .map((row) => stringValue(row.mealId))
      .filter((id): id is string => Boolean(id)),
  );
  const todayItems = activeRows(itemRows).filter((row) => {
    const mealId = stringValue(row.mealId);
    return Boolean(mealId && todayMealIds.has(mealId));
  });

  const macros: NutritionMacroProgress[] = [
    macroFromItems({
      key: 'protein',
      label: 'Proteína',
      column: 'proteinGrams',
      target: target?.proteinGrams ?? null,
      items: todayItems,
    }),
    macroFromItems({
      key: 'carbohydrate',
      label: 'Carbohidratos',
      column: 'carbohydrateGrams',
      target: target?.carbohydrateGrams ?? null,
      items: todayItems,
    }),
    macroFromItems({
      key: 'fat',
      label: 'Grasas',
      column: 'fatGrams',
      target: target?.fatGrams ?? null,
      items: todayItems,
    }),
    macroFromItems({
      key: 'fiber',
      label: 'Fibra',
      column: 'fiberGrams',
      target: target?.fiberGrams ?? null,
      items: todayItems,
    }),
  ];

  const personalFiberTarget = target?.fiberGrams ?? null;
  const nutrients = buildNutrients(nutrientResult, nutrientTargetsResult, todayItems, today).map(
    (nutrient) => {
      if (nutrient.key === 'fiber' && personalFiberTarget !== null) {
        return { ...nutrient, target: personalFiberTarget };
      }
      return nutrient;
    },
  );

  return {
    source: {
      status: sourceStatus,
      code: failure,
      label:
        sourceStatus === 'ready'
          ? 'Nutrition Intelligence · Google Sheets'
          : sourceStatus === 'partial'
            ? 'Nutrition Intelligence · datos parciales'
            : 'Nutrition Intelligence · sin conexión',
    },
    today,
    target,
    todayEnergy: {
      amount: todayDaily?.energyKcal ?? null,
      low: todayDaily?.energyKcalLow ?? null,
      high: todayDaily?.energyKcalHigh ?? null,
      coverage: todayDaily?.energyCoverage ?? 'none',
      quality: todayDaily?.estimateQuality ?? 'unknown',
      dayStatus:
        stringValue(dailyRows.find((row) => stringValue(row.date) === today)?.dayStatus ?? null) ===
        'closed'
          ? 'closed'
          : stringValue(
                dailyRows.find((row) => stringValue(row.date) === today)?.dayStatus ?? null,
              ) === 'open'
            ? 'open'
            : 'unknown',
      trackedMealCount: todayDaily?.trackedMealCount ?? 0,
    },
    macros,
    history,
    meals: buildMeals(mealRows, itemRows, today),
    nutrients,
    aiInsights: parseAiInsights(insightsResult, today),
    optionalSources: {
      nutrientTargets: optionalStatus(nutrientTargetsResult),
      nutrientSummary: optionalStatus(nutrientResult),
      aiInsights: optionalStatus(insightsResult),
    },
  };
}

export { cordobaToday, nutrientCatalogEntry, rowsFrom };
