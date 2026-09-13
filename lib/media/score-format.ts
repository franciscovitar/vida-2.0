const EXTERNAL_TWO_DECIMAL_VERSION = 'external-scoring-v1.2';

export function formatExternalMediaScore(
  value: number | null,
  scoreVersion: string | null | undefined,
): string {
  if (value === null) return '—';
  const digits = scoreVersion === EXTERNAL_TWO_DECIMAL_VERSION ? 2 : 1;
  return value.toLocaleString('es-AR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
