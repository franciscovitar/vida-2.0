# Naranja X importer — V1 parser checkpoint

Status: parser core implemented; PDF text extraction and store writes are intentionally not yet connected.

## Input contract

The parser accepts extracted text from a Naranja X monthly statement plus the statement year.

It recognizes separate ARS and USD account sections and preserves native currency.

## Deterministic semantics

For each account section:

1. read opening and statement closing balances;
2. parse operation date, source operation ID, description, printed amount magnitude and balance after;
3. keep multiline descriptions attached to their operation;
4. deduplicate identical repeated source operation IDs;
5. fail closed on conflicting duplicates;
6. derive the signed economic cash movement from the running-balance delta;
7. require the absolute balance delta to equal the printed operation amount;
8. expose the derived closing balance and reconciliation difference.

This intentionally catches the July/August duplicate-row defect previously observed in real Naranja X PDFs without counting duplicated operations twice.

## Current safety boundary

- no statement PDF is uploaded through Vida yet;
- no personal Finance Sheet writes are enabled;
- no private statement text or fixture is committed;
- tests use synthetic statement text;
- the next adapter must extract PDF text server-side and hash the source evidence before any bounded import is proposed.

## Next acceptance gate

Run the parser against the already-audited 2026 Naranja X evidence outside Git and prove:

- unique operation counts match the audited baseline;
- known duplicate operation IDs are detected;
- reconciled months produce zero difference;
- April→May continuity conflict remains explicit rather than guessed;
- September remains partial/current-month;
- ARS and USD are separate accounts.

Only after this validation should the write/import transaction builder be connected.
