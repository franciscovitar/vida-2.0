import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseNaranjaXStatementText } from '@/lib/finance/importers/naranja-x';

const SAMPLE = `
Datos cuenta en pesos
Resumen del mes de julio
Dinero inicial del 01/JUL Dinero final al 31/JUL
En cuenta $ 1.000,00 En cuenta $ 1.125,00
Dinero total inicial $ 1.000,00 Dinero total final $ 1.125,00
Movimientos del mes de tu cuenta
Dinero inicial $ 1.000,00
01/JUL 10000000001 Rendimiento diario $ 25,00 $ 1.025,00
02/JUL 10000000002 Transferencia recibida Persona
Ejemplo
$ 200,00 $ 1.225,00
03/JUL 10000000003 Pago con tarjeta de débito $ 100,00 $ 1.125,00
03/JUL 10000000003 Pago con tarjeta de débito $ 100,00 $ 1.125,00
Dinero final $ 225,00 -$ 100,00 $ 1.125,00

Datos cuenta en dólares
Resumen del mes de julio
Dinero inicial del 01/JUL Dinero final al 31/JUL
En cuenta USD 2,00 En cuenta USD 3,50
Dinero total inicial USD 2,00 Dinero total final USD 3,50
Movimientos del mes de tu cuenta
Dinero inicial USD 2,00
04/JUL 10000000004 Compra de dólar oficial USD 1,50 USD 3,50
Transferencia a tu cuenta en dólares
Dinero final USD 1,50 USD 3,50
`;

test('Naranja X parser preserves native currency and derives signed amounts from balances', () => {
  const result = parseNaranjaXStatementText(SAMPLE, 2026);
  assert.equal(result.sections.length, 2);

  const ars = result.sections.find((section) => section.currency === 'ARS');
  assert.ok(ars);
  assert.equal(ars.statementClosed, true);
  assert.equal(ars.openingBalanceMinor, 100_000);
  assert.equal(ars.transactions.length, 3);
  assert.deepEqual(
    ars.transactions.map((item) => item.amountMinor),
    [2_500, 20_000, -10_000],
  );
  assert.equal(ars.transactions[1].description, 'Transferencia recibida Persona Ejemplo');
  assert.deepEqual(ars.duplicateSourceTransactionIds, ['10000000003']);
  assert.equal(ars.reconciliationDifferenceMinor, 0);

  const usd = result.sections.find((section) => section.currency === 'USD');
  assert.ok(usd);
  assert.equal(usd.transactions[0].amountMinor, 150);
  assert.equal(
    usd.transactions[0].description,
    'Compra de dólar oficial Transferencia a tu cuenta en dólares',
  );
  assert.equal(usd.transactions[0].occurredOn, '2026-07-04');
  assert.equal(usd.reconciliationDifferenceMinor, 0);
});

test('Naranja X parser accepts current-month statements as explicitly partial', () => {
  const partial = `
Datos cuenta en pesos
Movimientos del mes de tu cuenta
Dinero inicial $ 267.266,41
01/SEPT 14282802745 Rendimiento diario $ 139,12 $ 267.405,53
01/SEPT 14289947564 Transferencia recibida Persona
Ejemplo
$ 100.000,00 $ 367.405,53
`;

  const result = parseNaranjaXStatementText(partial, 2026);
  const ars = result.sections[0];

  assert.equal(ars.statementClosed, false);
  assert.equal(ars.statementClosingBalanceMinor, null);
  assert.equal(ars.reconciliationDifferenceMinor, null);
  assert.equal(ars.derivedClosingBalanceMinor, 36_740_553);
  assert.equal(ars.transactions[1].occurredOn, '2026-09-01');
});

test('Naranja X parser rejects conflicting duplicate operation ids', () => {
  const conflict = SAMPLE.replace(
    '03/JUL 10000000003 Pago con tarjeta de débito $ 100,00 $ 1.125,00\n03/JUL 10000000003 Pago con tarjeta de débito $ 100,00 $ 1.125,00',
    '03/JUL 10000000003 Pago con tarjeta de débito $ 100,00 $ 1.125,00\n03/JUL 10000000003 Pago con tarjeta de débito $ 99,00 $ 1.125,00',
  );

  assert.throws(() => parseNaranjaXStatementText(conflict, 2026), /Conflicting duplicate/);
});

test('Naranja X parser rejects a balance delta that disagrees with the printed amount', () => {
  const mismatch = SAMPLE.replace(
    '01/JUL 10000000001 Rendimiento diario $ 25,00 $ 1.025,00',
    '01/JUL 10000000001 Rendimiento diario $ 20,00 $ 1.025,00',
  );

  assert.throws(() => parseNaranjaXStatementText(mismatch, 2026), /balance delta mismatch/);
});

test('Naranja X parser rejects an unsupported year', () => {
  assert.throws(() => parseNaranjaXStatementText(SAMPLE, 1999), RangeError);
});
