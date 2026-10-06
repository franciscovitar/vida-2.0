import 'server-only';

import type { PlainCell } from '@/lib/data/plain';
import type { SheetReadCode } from '@/lib/google/errors';

import {
  buildNutritionNutrientWindow,
  type NutritionNutrientWindowData,
} from './nutrient-window';
import { readNutritionTabValues } from './sheets-read';

type Row = Record<string, PlainCell>;

function rowsFromValues(values: readonly (readonly PlainCell[])[]): Row[] {
  if (values.length === 0) return [];
  const headers = values[0]!.map((cell) => String(cell ?? '').trim());
  return values.slice(1).map((cells) => {
    const row: Row = {};
    headers.forEach((header, index) => {
      if (header) row[header] = cells[index] ?? null;
    });
    return row;
  });
}

export interface NutritionNutrientWindowResult extends NutritionNutrientWindowData {
  source: {
    status: 'ready' | 'partial' | 'unavailable';
    code: SheetReadCode | null;
  };
}

export async function loadNutritionNutrientWindow(
  endDate: string,
  windowDays: number,
): Promise<NutritionNutrientWindowResult> {
  const [summaryResult, targetResult] = await Promise.all([
    readNutritionTabValues('Nutrient Summary'),
    readNutritionTabValues('Nutrient Targets'),
  ]);

  const summaryRows = summaryResult.ok ? rowsFromValues(summaryResult.values) : [];
  const targetRows = targetResult.ok ? rowsFromValues(targetResult.values) : [];
  const data = buildNutritionNutrientWindow(summaryRows, targetRows, endDate, windowDays);

  if (!summaryResult.ok) {
    return {
      ...data,
      source: { status: 'unavailable', code: summaryResult.code },
    };
  }

  return {
    ...data,
    source: {
      status: targetResult.ok ? 'ready' : 'partial',
      code: targetResult.ok ? null : targetResult.code,
    },
  };
}
