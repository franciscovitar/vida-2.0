/**
 * Fail-closed duplicate-ID audit for V2 Daily Planning rows.
 *
 * A valid idempotent retry can repeat an ID with the same payload and a
 * different write timestamp. A repeated ID with conflicting content is not a
 * usable snapshot and must never be resolved by "latest timestamp wins".
 * V1 rows and snapshots for other days are intentionally out of scope.
 */
const PREFIX = 'vida2:tasks-daily-planning:v2:orientation:';
const VERSION = 'daily-orientation-v2';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return ['array', value.map(canonical)];
  if (value !== null && typeof value === 'object') {
    return [
      'object',
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, canonical(entry)]),
    ];
  }
  return ['primitive', value];
}

function operationalFingerprint(row: readonly unknown[]): string | null {
  if (row.length < 6 || typeof row[3] !== 'string') return null;
  try {
    // Deliberately ignore generatedAt; an exact replay may occur later.
    return JSON.stringify([row[0], row[1], canonical(JSON.parse(row[3])), row[4], row[5]]);
  } catch {
    return null;
  }
}

/** Counts the rows belonging to conflicting duplicate snapshot IDs. */
export function countConflictingOrientationIdRows(
  values: readonly (readonly unknown[])[],
  targetDate: string,
): number {
  const seen = new Map<string, { fingerprint: string | null; index: number }>();
  const conflicting = new Set<number>();
  for (let index = 1; index < values.length; index++) {
    const row = values[index];
    if (!row || row[1] !== targetDate || row[5] !== VERSION) continue;
    const id = row[0];
    if (typeof id !== 'string' || !id.startsWith(`${PREFIX}${targetDate}:`)) continue;
    const fingerprint = operationalFingerprint(row);
    const previous = seen.get(id);
    if (!previous) {
      seen.set(id, { fingerprint, index });
      continue;
    }
    if (
      previous.fingerprint === null ||
      fingerprint === null ||
      previous.fingerprint !== fingerprint
    ) {
      conflicting.add(previous.index);
      conflicting.add(index);
    }
  }
  return conflicting.size;
}
