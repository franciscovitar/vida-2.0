import type { SheetReadCode } from '@/lib/google/errors';

export type NutritionCoverage = 'complete' | 'partial' | 'none' | 'unknown';
export type NutritionEstimateQuality = 'high' | 'medium' | 'low' | 'mixed' | 'unknown';
export type NutritionInsightCategory =
  | 'antioxidants'
  | 'anti-inflammatory'
  | 'improvement'
  | 'pattern';
export type NutritionInsightTone = 'positive' | 'watch' | 'neutral';
export type NutrientGroup = 'vitamin' | 'mineral' | 'other';

export interface NutritionTarget {
  decisionId: string;
  effectiveFrom: string;
  goal: string | null;
  energyKcal: number | null;
  proteinGrams: number | null;
  carbohydrateGrams: number | null;
  fatGrams: number | null;
  fiberGrams: number | null;
}

export interface NutritionMacroProgress {
  key: 'protein' | 'carbohydrate' | 'fat' | 'fiber';
  label: string;
  amount: number | null;
  target: number | null;
  unit: 'g';
  coverage: NutritionCoverage;
  knownItemCount: number;
  totalItemCount: number;
}

export interface NutritionDailyPoint {
  date: string;
  energyKcal: number | null;
  energyKcalLow: number | null;
  energyKcalHigh: number | null;
  estimateQuality: NutritionEstimateQuality;
  energyCoverage: NutritionCoverage;
  macroCoverage: NutritionCoverage;
  trackedMealCount: number;
  lowConfidenceItemCount: number;
}

export interface NutritionMealSummary {
  mealId: string;
  mealType: string;
  timeLabel: string | null;
  title: string;
  foodNames: readonly string[];
  energyKcal: number | null;
  energyKcalLow: number | null;
  energyKcalHigh: number | null;
  confidence: 'high' | 'medium' | 'low' | 'mixed' | 'unknown';
}

export interface NutritionNutrientValue {
  key: string;
  name: string;
  group: NutrientGroup;
  amount: number | null;
  unit: string;
  target: number | null;
  lowerTarget: number | null;
  upperTarget: number | null;
  confidence: 'high' | 'medium' | 'low' | 'mixed' | 'unknown';
  sourceCoverage: NutritionCoverage;
  notes: string | null;
}

export interface NutritionAiInsight {
  id: string;
  category: NutritionInsightCategory;
  tone: NutritionInsightTone;
  title: string;
  detail: string;
  evidence: string | null;
  window: string | null;
}

export interface NutritionDashboardData {
  source: {
    status: 'ready' | 'partial' | 'unavailable';
    code: SheetReadCode | null;
    label: string;
  };
  today: string;
  target: NutritionTarget | null;
  todayEnergy: {
    amount: number | null;
    low: number | null;
    high: number | null;
    coverage: NutritionCoverage;
    quality: NutritionEstimateQuality;
    dayStatus: 'open' | 'closed' | 'unknown';
    trackedMealCount: number;
  };
  macros: readonly NutritionMacroProgress[];
  history: readonly NutritionDailyPoint[];
  meals: readonly NutritionMealSummary[];
  nutrients: readonly NutritionNutrientValue[];
  aiInsights: readonly NutritionAiInsight[];
  optionalSources: {
    nutrientSummary: 'ready' | 'missing' | 'unavailable';
    aiInsights: 'ready' | 'missing' | 'unavailable';
  };
}
