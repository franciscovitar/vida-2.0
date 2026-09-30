export type OwnedTransferSource = 'naranja-x' | 'mercado-pago';

export interface OwnedTransferCandidate {
  source: OwnedTransferSource;
  rawTransactionId: string;
  sourceTransactionId: string;
  occurredOn: string;
  amountMinor: number;
  currency: string;
  confirmedOwnedAccountTransfer: boolean;
}

export interface ExactOwnedTransferMatch {
  id: string;
  naranjaRawTransactionId: string;
  mercadoPagoRawTransactionId: string;
  occurredOn: string;
  amountMinor: number;
  currency: string;
  direction: 'NARANJA_X_TO_MERCADO_PAGO' | 'MERCADO_PAGO_TO_NARANJA_X';
  confidence: 1;
}

export interface ExactOwnedTransferMatchResult {
  matches: ExactOwnedTransferMatch[];
  ambiguousCandidateIds: string[];
  unmatchedConfirmedCandidateIds: string[];
  ignoredUnconfirmedCount: number;
}

function key(candidate: OwnedTransferCandidate): string {
  return `${candidate.occurredOn}|${candidate.currency}|${Math.abs(candidate.amountMinor)}`;
}

function validateCandidate(candidate: OwnedTransferCandidate): void {
  if (!candidate.rawTransactionId.trim()) throw new Error('rawTransactionId is required');
  if (!candidate.sourceTransactionId.trim()) throw new Error('sourceTransactionId is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate.occurredOn)) {
    throw new Error(`Invalid transfer date: ${candidate.occurredOn}`);
  }
  if (!Number.isSafeInteger(candidate.amountMinor) || candidate.amountMinor === 0) {
    throw new RangeError('Owned-transfer amount must be a non-zero safe integer');
  }
  if (!candidate.currency.trim()) throw new Error('currency is required');
}

export function matchExactOwnedAccountTransfers(
  candidates: readonly OwnedTransferCandidate[],
): ExactOwnedTransferMatchResult {
  const rawIds = new Set<string>();
  const confirmed = candidates.filter((candidate) => {
    validateCandidate(candidate);
    if (rawIds.has(candidate.rawTransactionId)) {
      throw new Error(`Duplicate owned-transfer candidate: ${candidate.rawTransactionId}`);
    }
    rawIds.add(candidate.rawTransactionId);
    return candidate.confirmedOwnedAccountTransfer;
  });

  const ignoredUnconfirmedCount = candidates.length - confirmed.length;
  const groups = new Map<string, OwnedTransferCandidate[]>();

  for (const candidate of confirmed) {
    const groupKey = key(candidate);
    const group = groups.get(groupKey) ?? [];
    group.push(candidate);
    groups.set(groupKey, group);
  }

  const matches: ExactOwnedTransferMatch[] = [];
  const ambiguousCandidateIds = new Set<string>();
  const matchedCandidateIds = new Set<string>();

  for (const group of groups.values()) {
    const naranja = group.filter((candidate) => candidate.source === 'naranja-x');
    const mercadoPago = group.filter((candidate) => candidate.source === 'mercado-pago');

    const validPairs: [OwnedTransferCandidate, OwnedTransferCandidate][] = [];
    for (const nx of naranja) {
      for (const mp of mercadoPago) {
        if (nx.amountMinor + mp.amountMinor === 0) {
          validPairs.push([nx, mp]);
        }
      }
    }

    if (validPairs.length === 1 && naranja.length === 1 && mercadoPago.length === 1) {
      const [nx, mp] = validPairs[0];
      matchedCandidateIds.add(nx.rawTransactionId);
      matchedCandidateIds.add(mp.rawTransactionId);

      matches.push({
        id: `finance-match:owned-transfer:${nx.sourceTransactionId}:${mp.sourceTransactionId}`,
        naranjaRawTransactionId: nx.rawTransactionId,
        mercadoPagoRawTransactionId: mp.rawTransactionId,
        occurredOn: nx.occurredOn,
        amountMinor: Math.abs(nx.amountMinor),
        currency: nx.currency,
        direction: nx.amountMinor < 0 ? 'NARANJA_X_TO_MERCADO_PAGO' : 'MERCADO_PAGO_TO_NARANJA_X',
        confidence: 1,
      });
      continue;
    }

    if (validPairs.length > 0) {
      for (const [nx, mp] of validPairs) {
        ambiguousCandidateIds.add(nx.rawTransactionId);
        ambiguousCandidateIds.add(mp.rawTransactionId);
      }
    }
  }

  const unmatchedConfirmedCandidateIds = confirmed
    .filter(
      (candidate) =>
        !matchedCandidateIds.has(candidate.rawTransactionId) &&
        !ambiguousCandidateIds.has(candidate.rawTransactionId),
    )
    .map((candidate) => candidate.rawTransactionId)
    .sort();

  return {
    matches: matches.sort((a, b) => a.occurredOn.localeCompare(b.occurredOn)),
    ambiguousCandidateIds: [...ambiguousCandidateIds].sort(),
    unmatchedConfirmedCandidateIds,
    ignoredUnconfirmedCount,
  };
}
