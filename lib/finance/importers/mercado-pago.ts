const MONTH_BY_NAME: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

export interface MercadoPagoParsedTransaction {
  sourceTransactionId: string;
  occurredOn: string;
  description: string;
  amountMinor: number;
  balanceAfterMinor: number;
  currency: 'ARS';
}

export interface MercadoPagoStatementResult {
  statementPeriod: string;
  openingBalanceMinor: number;
  statementInflowsMinor: number;
  statementOutflowsMinor: number;
  statementClosingBalanceMinor: number;
  derivedClosingBalanceMinor: number;
  transactions: MercadoPagoParsedTransaction[];
}

function parseMoneyMinor(value: string): number {
  const normalized = value.replace(/\./g, '').replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid Mercado Pago money value: ${value}`);
  }

  const minor = Math.round(parsed * 100);
  if (!Number.isSafeInteger(minor)) {
    throw new RangeError('Mercado Pago money value exceeds safe integer range');
  }
  return minor;
}

function cleanExtractedText(statementText: string): string {
  const kept: string[] = [];

  for (const rawLine of statementText.replace(/\r/g, '').split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^\d+\/\d+$/.test(line)) continue;
    if (line.startsWith('Fecha de generación:')) continue;
    if (line.startsWith('Mercado Libre S.R.L. CUIT')) continue;
    if (line.startsWith('de consulta en:')) continue;
    if (line.startsWith('Fecha Descripción ID de la')) continue;
    if (line === 'operación Valor Saldo') continue;
    kept.push(line);
  }

  return kept.join(' ');
}

function parseStatementPeriod(text: string): string {
  const match = text.match(
    /Del\s+1\s+al\s+\d{1,2}\s+de\s+([a-záéíóúñ]+)\s+de\s+(\d{4})\s*Periodo:/i,
  );
  if (!match) throw new Error('Missing Mercado Pago statement period');

  const monthName = match[1].toLowerCase();
  const month = MONTH_BY_NAME[monthName];
  if (!month) throw new Error(`Unknown Mercado Pago month: ${match[1]}`);

  return `${match[2]}-${String(month).padStart(2, '0')}`;
}

function parseSummaryValue(text: string, label: string): number {
  const match = text.match(new RegExp(`${label}:\\s*\\$\\s*(-?[\\d.]+,\\d{2})`, 'i'));
  if (!match) throw new Error(`Missing Mercado Pago summary field: ${label}`);
  return parseMoneyMinor(match[1]);
}

function toIsoDate(value: string): string {
  const match = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) throw new Error(`Invalid Mercado Pago date: ${value}`);

  const day = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const year = Number.parseInt(match[3], 10);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid Mercado Pago date: ${value}`);
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseMercadoPagoStatementText(statementText: string): MercadoPagoStatementResult {
  const text = cleanExtractedText(statementText);
  const statementPeriod = parseStatementPeriod(text);
  const openingBalanceMinor = parseSummaryValue(text, 'Saldo inicial');
  const statementInflowsMinor = parseSummaryValue(text, 'Entradas');
  const statementOutflowsMinor = parseSummaryValue(text, 'Salidas');
  const statementClosingBalanceMinor = parseSummaryValue(text, 'Saldo final');

  const pattern =
    /(\d{2}-\d{2}-\d{4})\s+(.*?)\s+(\d{10,13})\s+\$\s*(-?[\d.]+,\d{2})\s+\$\s*([\d.]+,\d{2})/g;

  const transactions: MercadoPagoParsedTransaction[] = [];
  const sourceIds = new Set<string>();
  let previousBalanceMinor = openingBalanceMinor;

  for (const match of text.matchAll(pattern)) {
    const sourceTransactionId = match[3];
    if (sourceIds.has(sourceTransactionId)) {
      throw new Error(`Duplicate Mercado Pago operation id: ${sourceTransactionId}`);
    }
    sourceIds.add(sourceTransactionId);

    const amountMinor = parseMoneyMinor(match[4]);
    const balanceAfterMinor = parseMoneyMinor(match[5]);
    if (previousBalanceMinor + amountMinor !== balanceAfterMinor) {
      throw new Error(`Mercado Pago balance delta mismatch for operation ${sourceTransactionId}`);
    }

    transactions.push({
      sourceTransactionId,
      occurredOn: toIsoDate(match[1]),
      description: match[2].replace(/\s+/g, ' ').trim(),
      amountMinor,
      balanceAfterMinor,
      currency: 'ARS',
    });

    previousBalanceMinor = balanceAfterMinor;
  }

  if (transactions.length === 0) {
    throw new Error('No Mercado Pago movements found');
  }

  const derivedInflowsMinor = transactions
    .filter((item) => item.amountMinor > 0)
    .reduce((sum, item) => sum + item.amountMinor, 0);
  const derivedOutflowsMinor = transactions
    .filter((item) => item.amountMinor < 0)
    .reduce((sum, item) => sum + item.amountMinor, 0);

  if (derivedInflowsMinor !== statementInflowsMinor) {
    throw new Error('Mercado Pago statement inflows mismatch');
  }
  if (derivedOutflowsMinor !== statementOutflowsMinor) {
    throw new Error('Mercado Pago statement outflows mismatch');
  }
  if (previousBalanceMinor !== statementClosingBalanceMinor) {
    throw new Error('Mercado Pago statement closing balance mismatch');
  }

  const txPeriods = new Set(transactions.map((item) => item.occurredOn.slice(0, 7)));
  if (txPeriods.size !== 1 || !txPeriods.has(statementPeriod)) {
    throw new Error('Mercado Pago movement dates fall outside statement period');
  }

  return {
    statementPeriod,
    openingBalanceMinor,
    statementInflowsMinor,
    statementOutflowsMinor,
    statementClosingBalanceMinor,
    derivedClosingBalanceMinor: previousBalanceMinor,
    transactions,
  };
}
