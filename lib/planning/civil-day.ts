/**
 * Parse a true Gregorian YYYY-MM-DD civil day at UTC noon, without timezone drift.
 * Invalid dates must not be silently normalized into upcoming commitments.
 */
export function parsePlanningCivilDay(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const timestamp = Date.parse(`${value}T12:00:00Z`);
  if (!Number.isFinite(timestamp)) return null;

  return new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : null;
}
