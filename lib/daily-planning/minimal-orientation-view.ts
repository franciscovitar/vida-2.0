import type {
  DailyOrientationSnapshotRead,
  DailyOrientationView,
} from '@/types/daily-orientation-v2';

/**
 * The dedicated Planning V2 screen is a dated, read-only publication viewer.
 * All reasoning/source checks happen upstream in the ChatGPT Project.
 *
 * A persisted canonical ref does NOT become a verified current fact merely
 * because it was copied into a snapshot. Without a live source check, the
 * ref-bearing entry is withheld rather than presented as confirmed today.
 * The browser receives no canonical ref or snapshot ID.
 */
export function buildMinimalOrientationView(
  read: DailyOrientationSnapshotRead,
  targetDate: string,
): DailyOrientationView {
  const snapshot = read.snapshot;
  let unresolvedRefs = 0;

  const attention =
    snapshot?.payload.attention.flatMap((item) => {
      if (item.ref !== null) {
        unresolvedRefs += 1;
        return [];
      }
      const { domain, targetKind, title, recommendation, why, confidence, nextAction } = item;
      return [{ domain, targetKind, title, recommendation, why, confidence, nextAction }];
    }) ?? [];

  const upcoming =
    snapshot?.payload.upcoming.flatMap((item) => {
      if (item.ref !== null) {
        unresolvedRefs += 1;
        return [];
      }
      const { kind, title, date, dateType, reason } = item;
      return [{ kind, title, date, dateType, reason }];
    }) ?? [];

  function resolveFocus(items: NonNullable<typeof snapshot>['payload']['minimum']) {
    return items.flatMap((item) => {
      if (item.ref !== null) {
        unresolvedRefs += 1;
        return [];
      }
      return [{ domain: item.domain, title: item.title, why: item.why }];
    });
  }

  const minimum = snapshot ? resolveFocus(snapshot.payload.minimum) : [];
  const notNow = snapshot ? resolveFocus(snapshot.payload.notNow) : [];

  const status: DailyOrientationView['status'] = snapshot
    ? read.status === 'ready' && unresolvedRefs === 0
      ? 'ready'
      : 'degraded'
    : read.status === 'empty'
      ? 'empty'
      : read.status === 'unavailable'
        ? 'unavailable'
        : 'degraded';

  const notice = unresolvedRefs
    ? `${read.notice ? `${read.notice} ` : ''}${unresolvedRefs} entrada(s) referenciada(s) se ocultaron: el snapshot no verifica si siguen vigentes.`
    : read.notice;

  return {
    status,
    readStatus: read.status,
    notice,
    targetDate,
    generatedAt: snapshot?.generatedAt ?? null,
    review: snapshot?.payload.review ?? null,
    attention,
    upcoming,
    lifeSignals: snapshot?.payload.lifeSignals ?? [],
    minimum,
    notNow,
    quality: {
      unresolvedRefs,
      dateConflicts: 0,
      invalidRows: read.invalidRows,
    },
  };
}
