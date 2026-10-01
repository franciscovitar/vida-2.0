# Finance cash-flow reporting V1

Status: implementation contract for read-only Finance OS reporting.

## Purpose

Render personal financial truth from the canonical Finance Sheet without copying private
transactions into Git and without inventing a cross-currency total.

## Economic view

Only postings on accounts with `ownership=owned` participate in personal cash-flow
reporting.

Included economic roles:

- `income_work`
- `income_family_support`
- `income_financial`
- `expense_personal`
- `expense_professional`
- `refund_adjustment`

Excluded from economic income/expense:

- `internal_transfer`
- `reimbursement`
- `business_pass_through`
- `family_pass_through`
- `liability_settlement`
- `unknown_review`

The excluded rows remain in the canonical ledger. Exclusion means only that they are not
counted again as personal economic income or expense.

## Native currency

ARS and USD are reported separately. V1 does not fabricate a generic exchange rate or a
single combined net result.

## Quality gates

The reporting surface exposes:

- resolved versus review-required transactions;
- transactions whose postings fail to balance by native currency;
- reconciliation status counts;
- imported source coverage by account.

A report is `ready` only when there are no review-required transactions, no
`unknown_review` roles on owned accounts and no unbalanced canonical transactions.

Known source conflicts/partial reconciliations stay visible; they do not silently rewrite
the ledger.

## Privacy

The page reads the private Finance Sheet server-side through the existing authenticated,
read-only store client. No raw transaction description, account balance, account number,
counterparty mapping or personal financial amount is committed to GitHub.
