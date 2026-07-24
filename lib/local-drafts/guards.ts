export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isString(value: unknown, maxLength = 4_000): value is string {
  return typeof value === 'string' && value.length <= maxLength;
}

export function isNullableString(value: unknown, maxLength = 4_000): value is string | null {
  return value === null || isString(value, maxLength);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isFiniteNumber(
  value: unknown,
  minimum = Number.NEGATIVE_INFINITY,
  maximum = Number.POSITIVE_INFINITY,
): value is number {
  return (
    typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
  );
}

export function isNullableFiniteNumber(
  value: unknown,
  minimum = Number.NEGATIVE_INFINITY,
  maximum = Number.POSITIVE_INFINITY,
): value is number | null {
  return value === null || isFiniteNumber(value, minimum, maximum);
}

export function isOneOf<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
): value is T[number] {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

export function isArrayOf<T>(
  value: unknown,
  maximumItems: number,
  predicate: (item: unknown) => item is T,
): value is T[] {
  return Array.isArray(value) && value.length <= maximumItems && value.every(predicate);
}
