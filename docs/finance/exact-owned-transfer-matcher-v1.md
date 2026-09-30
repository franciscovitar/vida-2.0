# Exact owned-account transfer matcher — V1

Status: zero-write matching primitive.

## Purpose

Detect high-confidence evidence that two raw source movements represent the two sides of one transfer between accounts owned by the user.

This matcher exists to prevent internal transfers from becoming personal income or personal expense.

## Privacy boundary

The matcher does **not** contain the user's name, account aliases or private counterparty mappings.

Whether a source row is a confirmed own-account transfer is determined outside GitHub from authorized operational evidence. The matcher receives only a boolean confirmation plus source IDs/date/amount/currency.

## Exact auto-match rule

A pair is auto-matchable only when:

- both candidates were independently confirmed as own-account transfers;
- one source is Naranja X and the other is Mercado Pago;
- date is identical;
- currency is identical;
- absolute amount is identical;
- signs are opposite;
- the date/currency/amount group contains exactly one candidate from each source.

The resulting confidence is 1.

If more than one plausible pair exists in the group, all plausible candidates are marked ambiguous and nothing is auto-matched.

## Canonical consequence

This primitive does not mutate the ledger.

After Mercado Pago raw ingestion, a separate bounded merge plan may:

- attach the Mercado Pago raw row as a second Transaction Source to the existing Naranja X canonical transaction;
- replace the unclassified contra posting with the Mercado Pago account posting;
- mark the resulting canonical transaction as an internal transfer;
- avoid creating a second economic transaction for the Mercado Pago source row.

That transform requires its own dry-run and write gate.
