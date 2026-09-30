# Mercado Pago wallet importer — V1 parser checkpoint

Status: parser core implemented; Finance Sheet writes are not connected.

## Source scope

This adapter is for the Mercado Pago **wallet/account statement in ARS**.

It does not parse Mercado Pago Mastercard credit activity. Credit-card purchases/fees are a separate liability source and must not be merged into wallet cash movements.

## Deterministic statement contract

For each monthly wallet statement the parser:

1. reads the statement period, opening balance, total inflows, total outflows and closing balance;
2. parses every movement date, Mercado Pago operation ID, multiline description, signed amount and balance after;
3. requires operation IDs to be unique;
4. validates every running-balance delta in source order;
5. requires parsed positive movements to equal the printed Entradas total;
6. requires parsed negative movements to equal the printed Salidas total;
7. requires the derived close to equal the printed closing balance;
8. requires every movement date to belong to the statement period.

It fails closed when any invariant breaks.

## Privacy and semantics

Raw statement text and private counterparty data remain outside GitHub.

The parser deliberately does not classify a movement as personal income or expense. Mercado Pago is mixed-use and requires later beneficial-ownership, clearing, reimbursement and cross-source matching rules.

## Next acceptance gate

Validate Jan-Aug 2026 real evidence against the existing audited baseline:

- 380 unique wallet movements total;
- monthly counts: 38 / 42 / 56 / 61 / 52 / 41 / 44 / 46;
- every operation ID, amount, running balance and normalized description matches the accepted baseline;
- every monthly statement summary and month-to-month continuity reconciles exactly;
- the 14 known Naranja X ↔ Mercado Pago own-account matches remain linkable by source operation ID;
- no operational-store write occurs.

Only after that should a zero-write import plan be built.
