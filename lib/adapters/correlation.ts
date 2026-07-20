/**
 * Correlación de Spearman y clasificación prudente (sin causalidad).
 */
export type AssociationStrength = 'minimal' | 'weak' | 'moderate' | 'strong';

export type SampleConfidence = 'insufficient' | 'very_small' | 'limited' | 'useful';

export interface AlignedPair {
  date: string;
  x: number;
  y: number;
}

export interface SpearmanResult {
  /** null si n < 5. */
  rho: number | null;
  n: number;
  confidence: SampleConfidence;
  strength: AssociationStrength | null;
  direction: 'positive' | 'negative' | 'none';
  strengthLabel: string;
  confidenceLabel: string;
  causalityDisclaimer: string;
}

export const CAUSALITY_DISCLAIMER =
  'Esto no demuestra que una variable cause la otra; solo se observa una asociación en los días con datos coincidentes.';

const MIN_PAIRS = 5;

/** Ranks con promedio en empates (1-based). */
export function averageRanks(values: readonly number[]): number[] {
  const indexed = values.map((value, index) => ({ value, index }));
  indexed.sort((a, b) => a.value - b.value);
  const ranks = new Array<number>(values.length).fill(0);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j < indexed.length && indexed[j].value === indexed[i].value) j += 1;
    const avg = (i + 1 + j) / 2;
    for (let k = i; k < j; k += 1) ranks[indexed[k].index] = avg;
    i = j;
  }
  return ranks;
}

function pearson(xs: readonly number[], ys: readonly number[]): number | null {
  const n = xs.length;
  if (n < 2) return null;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i += 1) {
    sumX += xs[i];
    sumY += ys[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  if (denX === 0 || denY === 0) return null;
  const r = num / Math.sqrt(denX * denY);
  if (!Number.isFinite(r)) return null;
  return Math.round(r * 1000) / 1000;
}

export function sampleConfidence(n: number): SampleConfidence {
  if (n < MIN_PAIRS) return 'insufficient';
  if (n <= 9) return 'very_small';
  if (n <= 19) return 'limited';
  return 'useful';
}

export function classifyStrength(absRho: number): AssociationStrength {
  if (absRho < 0.2) return 'minimal';
  if (absRho < 0.4) return 'weak';
  if (absRho < 0.6) return 'moderate';
  return 'strong';
}

export function strengthLabel(strength: AssociationStrength): string {
  if (strength === 'minimal') return 'asociación mínima';
  if (strength === 'weak') return 'débil';
  if (strength === 'moderate') return 'moderada';
  return 'fuerte';
}

export function confidenceLabel(confidence: SampleConfidence): string {
  if (confidence === 'insufficient') return 'muestra insuficiente (menos de 5 pares)';
  if (confidence === 'very_small') return 'muestra muy pequeña';
  if (confidence === 'limited') return 'confianza limitada';
  return 'muestra más útil (sin afirmar causalidad)';
}

/** Spearman ρ sobre pares alineados. No calcula si n < 5. */
export function spearmanFromPairs(pairs: readonly AlignedPair[]): SpearmanResult {
  const n = pairs.length;
  const confidence = sampleConfidence(n);
  const base = {
    n,
    confidence,
    causalityDisclaimer: CAUSALITY_DISCLAIMER,
    confidenceLabel: confidenceLabel(confidence),
  };

  if (n < MIN_PAIRS) {
    return {
      ...base,
      rho: null,
      strength: null,
      direction: 'none',
      strengthLabel: 'no calculada',
    };
  }

  const xs = pairs.map((p) => p.x);
  const ys = pairs.map((p) => p.y);
  const rho = pearson(averageRanks(xs), averageRanks(ys));

  if (rho === null) {
    return {
      ...base,
      rho: null,
      strength: null,
      direction: 'none',
      strengthLabel: 'no calculada (varianza nula)',
    };
  }

  const strength = classifyStrength(Math.abs(rho));
  const direction = rho > 0 ? 'positive' : rho < 0 ? 'negative' : 'none';
  return {
    ...base,
    rho,
    strength,
    direction,
    strengthLabel: strengthLabel(strength),
  };
}

/** Alinea dos series por la misma fecha; omite días sin ambos valores. */
export function alignByDate(
  left: ReadonlyMap<string, number>,
  right: ReadonlyMap<string, number>,
): AlignedPair[] {
  const pairs: AlignedPair[] = [];
  for (const [date, x] of left) {
    const y = right.get(date);
    if (y === undefined) continue;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    pairs.push({ date, x, y });
  }
  return pairs.sort((a, b) => a.date.localeCompare(b.date));
}
