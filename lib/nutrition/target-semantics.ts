import type { NutritionNutrientTargetSemantics } from './types';

export interface NutritionTargetSemanticsInput {
  target: number | null;
  lowerTarget: number | null;
  upperTarget: number | null;
  basis: string | null;
}

function normalizedBasis(value: string | null): string {
  return value?.trim().toLowerCase() ?? '';
}

export function classifyNutritionTargetSemantics(
  input: NutritionTargetSemanticsInput,
): NutritionNutrientTargetSemantics {
  const { target, lowerTarget, upperTarget } = input;
  const basis = normalizedBasis(input.basis);
  const adequacyBasis =
    /\b(rda|recommended dietary allowance|adequate intake|adequacy|minimum|minimo|mínimo)\b/.test(
      basis,
    ) || /^ai(?:\b|\s|\/)/.test(basis);
  const upperLimitBasis =
    /\b(ul|upper limit|tolerable upper|limite superior|límite superior|practical cap)\b/.test(
      basis,
    );

  if (target === null && lowerTarget === null && upperTarget === null) return 'none';
  if (adequacyBasis) return 'adequacy';
  if (upperLimitBasis) return 'upper-limit';
  if (lowerTarget !== null && upperTarget !== null && target === null) return 'range';
  if (lowerTarget !== null && target === null) return 'adequacy';
  if (upperTarget !== null && target === null) return 'upper-limit';
  if (target !== null) return 'point';

  return 'unknown';
}

export function nutritionProgressTarget(input: NutritionTargetSemanticsInput): number | null {
  const semantics = classifyNutritionTargetSemantics(input);

  if (semantics === 'adequacy') return input.target ?? input.lowerTarget;
  if (semantics === 'point') return input.target;

  return null;
}
