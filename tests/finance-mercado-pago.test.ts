import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseMercadoPagoStatementText } from '@/lib/finance/importers/mercado-pago';

const SAMPLE = `
1/2
RESUMEN DE CUENTA EN PESOS
Persona Ejemplo
Del 1 al 31 de marzo de 2026Periodo:
Saldo inicial: $ 1.000,00
Entradas: $ 200,50
Salidas: $ -75,25
Saldo final: $ 1.125,25
DETALLE DE MOVIMIENTOS
Fecha Descripción ID de la
operación Valor Saldo
01-03-2026 Transferencia recibida Persona
Ejemplo 150000000001 $ 200,00 $ 1.200,00
02-03-2026 Rendimientos 1740000000001 $ 0,50 $ 1.200,50
2/2
Fecha Descripción ID de la
operación Valor Saldo
03-03-2026 Pago comercio
Ejemplo 150000000002 $ -75,25 $ 1.125,25
Fecha de generación: 30-09-2026
Mercado Libre S.R.L. CUIT 30-70308853-4 ejemplo
de consulta en: www.mercadopago.com.ar
`;

test('Mercado Pago parser preserves statement order and exact balance deltas', () => {
  const result = parseMercadoPagoStatementText(SAMPLE);

  assert.equal(result.statementPeriod, '2026-03');
  assert.equal(result.openingBalanceMinor, 100_000);
  assert.equal(result.statementInflowsMinor, 20_050);
  assert.equal(result.statementOutflowsMinor, -7_525);
  assert.equal(result.statementClosingBalanceMinor, 112_525);
  assert.equal(result.derivedClosingBalanceMinor, 112_525);
  assert.equal(result.transactions.length, 3);

  assert.deepEqual(
    result.transactions.map((item) => item.amountMinor),
    [20_000, 50, -7_525],
  );
  assert.equal(result.transactions[0].description, 'Transferencia recibida Persona Ejemplo');
  assert.equal(result.transactions[2].description, 'Pago comercio Ejemplo');
});

test('Mercado Pago parser rejects duplicate operation ids', () => {
  const duplicate = SAMPLE.replace('150000000002 $ -75,25', '150000000001 $ -75,25');

  assert.throws(
    () => parseMercadoPagoStatementText(duplicate),
    /Duplicate Mercado Pago operation id/,
  );
});

test('Mercado Pago parser rejects a running-balance mismatch', () => {
  const mismatch = SAMPLE.replace('$ 1.200,50', '$ 1.200,49');

  assert.throws(() => parseMercadoPagoStatementText(mismatch), /balance delta mismatch/);
});

test('Mercado Pago parser rejects summary-total drift', () => {
  const mismatch = SAMPLE.replace('Entradas: $ 200,50', 'Entradas: $ 200,49');

  assert.throws(() => parseMercadoPagoStatementText(mismatch), /statement inflows mismatch/);
});
