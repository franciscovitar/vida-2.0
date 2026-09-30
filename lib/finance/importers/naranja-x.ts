const MONTH_BY_CODE: Record<string, number> = {
  ENE: 1,
  FEB: 2,
  MAR: 3,
  ABR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AGO: 8,
  SEP: 9,
  SEPT: 9,
  OCT: 10,
  NOV: 11,
  DIC: 12,
};

export type NaranjaCurrency = 'ARS' | 'USD';

export interface NaranjaParsedTransaction {
  sourceTransactionId: string;
  occurredOn: string;
  description: string;
  sourceAmountMinor: number;
  amountMinor: number;
  balanceAfterMinor: number;
  currency: NaranjaCurrency;
}

export interface NaranjaSectionResult {
  currency: NaranjaCurrency;
  statementClosed: boolean;
  openingBalanceMinor: number;
  statementClosingBalanceMinor: number | null;
  derivedClosingBalanceMinor: number;
  transactions: NaranjaParsedTransaction[];
  duplicateSourceTransactionIds: string[];
  reconciliationDifferenceMinor: number | null;
}

export interface NaranjaStatementResult {
  sections: NaranjaSectionResult[];
}

interface ParsedBlock {
  day: number;
  month: number;
  sourceTransactionId: string;
  description: string;
  sourceAmountMinor: number;
  balanceAfterMinor: number;
}

interface PendingBlock {
  day: number;
  month: number;
  sourceTransactionId: string;
  description: string;
  sourceAmountMinor: number | null;
  balanceAfterMinor: number | null;
}

function parseMoneyMinor(value: string): number {
  const normalized = value.replace(/\./g, '').replace(',', '.');
  const numberValue = Number.parseFloat(normalized);
  if (!Number.isFinite(numberValue)) {
    throw new Error(`Invalid Naranja X money value: ${value}`);
  }
  const minor = Math.round(numberValue * 100);
  if (!Number.isSafeInteger(minor)) {
    throw new RangeError('Naranja X money value exceeds safe integer range');
  }
  return minor;
}

function toIsoDate(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid Naranja X date: ${year}-${month}-${day}`);
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function extractSection(statementText: string, currency: NaranjaCurrency): string | null {
  const startMarker = currency === 'ARS' ? 'Datos cuenta en pesos' : 'Datos cuenta en dólares';
  const start = statementText.indexOf(startMarker);
  if (start < 0) return null;

  const rest = statementText.slice(start + startMarker.length);
  const nextMarkers =
    currency === 'ARS'
      ? ['Datos cuenta en dólares', 'Este resumen de cuenta es expedido']
      : ['Este resumen de cuenta es expedido'];

  let end = rest.length;
  for (const marker of nextMarkers) {
    const idx = rest.indexOf(marker);
    if (idx >= 0) end = Math.min(end, idx);
  }
  return rest.slice(0, end);
}

function extractOpeningBalance(section: string, currency: NaranjaCurrency): number {
  const unit = currency === 'ARS' ? '\\$' : 'USD';
  const patterns = [
    new RegExp(`Dinero total inicial\\s+${unit}\\s*([\\d.]+,\\d{2})`, 'i'),
    new RegExp(`Dinero inicial\\s+${unit}\\s*([\\d.]+,\\d{2})`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = section.match(pattern);
    if (match) return parseMoneyMinor(match[1]);
  }
  throw new Error(`Missing Naranja X ${currency} opening balance`);
}

function extractStatementClosingBalance(
  section: string,
  currency: NaranjaCurrency,
): number | null {
  const unit = currency === 'ARS' ? '\\$' : 'USD';
  const match = section.match(
    new RegExp(`Dinero total final\\s+${unit}\\s*([\\d.]+,\\d{2})`, 'i'),
  );
  return match ? parseMoneyMinor(match[1]) : null;
}

function parseBlocks(section: string, currency: NaranjaCurrency): ParsedBlock[] {
  const unit = currency === 'ARS' ? '\\$' : 'USD';
  const operationPattern = new RegExp(
    `^(\\d{2})/([A-ZÁÉÍÓÚÑ]{3,4})\\s+(\\d{10,13})\\s+(.+?)(?:\\s+${unit}\\s*([\\d.]+,\\d{2})\\s+${unit}\\s*([\\d.]+,\\d{2}))?\\s*$`,
    'u',
  );
  const amountsOnlyPattern = new RegExp(
    `^${unit}\\s*([\\d.]+,\\d{2})\\s+${unit}\\s*([\\d.]+,\\d{2})\\s*$`,
  );

  const blocks: ParsedBlock[] = [];
  let current: PendingBlock | null = null;

  function finalizeCurrent() {
    if (!current) return;
    if (current.sourceAmountMinor == null || current.balanceAfterMinor == null) {
      throw new Error(`Incomplete Naranja X operation ${current.sourceTransactionId}`);
    }
    blocks.push({
      ...current,
      sourceAmountMinor: current.sourceAmountMinor,
      balanceAfterMinor: current.balanceAfterMinor,
    });
    current = null;
  }

  for (const rawLine of section.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const operation = line.match(operationPattern);
    if (operation) {
      finalizeCurrent();

      const month = MONTH_BY_CODE[operation[2]];
      if (!month) throw new Error(`Unknown Naranja X month code: ${operation[2]}`);

      current = {
        day: Number.parseInt(operation[1], 10),
        month,
        sourceTransactionId: operation[3],
        description: operation[4].trim(),
        sourceAmountMinor: operation[5] ? parseMoneyMinor(operation[5]) : null,
        balanceAfterMinor: operation[6] ? parseMoneyMinor(operation[6]) : null,
      };
      continue;
    }

    if (!current) continue;

    const amountsOnly = line.match(amountsOnlyPattern);
    if (amountsOnly) {
      if (current.sourceAmountMinor != null || current.balanceAfterMinor != null) {
        throw new Error(
          `Duplicate amount line for Naranja X operation ${current.sourceTransactionId}`,
        );
      }
      current.sourceAmountMinor = parseMoneyMinor(amountsOnly[1]);
      current.balanceAfterMinor = parseMoneyMinor(amountsOnly[2]);
      continue;
    }

    if (
      line.startsWith('Dinero final') ||
      line.startsWith('Resumen del mes') ||
      line.startsWith('Movimientos del mes') ||
      line.startsWith('Nº de') ||
      line.startsWith('Fecha') ||
      line.startsWith('operación') ||
      line.startsWith('Descripción') ||
      line.startsWith('Dinero a la')
    ) {
      continue;
    }

    current.description = `${current.description} ${line}`.replace(/\s+/g, ' ').trim();
  }

  finalizeCurrent();
  return blocks;
}

function parseSection(
  statementText: string,
  currency: NaranjaCurrency,
  statementYear: number,
): NaranjaSectionResult | null {
  const section = extractSection(statementText, currency);
  if (!section) return null;

  const openingBalanceMinor = extractOpeningBalance(section, currency);
  const statementClosingBalanceMinor = extractStatementClosingBalance(section, currency);
  const blocks = parseBlocks(section, currency);

  const seen = new Map<string, ParsedBlock>();
  const duplicates: string[] = [];
  const unique: ParsedBlock[] = [];

  for (const block of blocks) {
    const prior = seen.get(block.sourceTransactionId);
    if (prior) {
      const identical =
        prior.day === block.day &&
        prior.month === block.month &&
        prior.description === block.description &&
        prior.sourceAmountMinor === block.sourceAmountMinor &&
        prior.balanceAfterMinor === block.balanceAfterMinor;
      if (!identical) {
        throw new Error(
          `Conflicting duplicate Naranja X operation ${block.sourceTransactionId}`,
        );
      }
      duplicates.push(block.sourceTransactionId);
      continue;
    }
    seen.set(block.sourceTransactionId, block);
    unique.push(block);
  }

  let previousBalanceMinor = openingBalanceMinor;
  const transactions: NaranjaParsedTransaction[] = [];

  for (const block of unique) {
    const amountMinor = block.balanceAfterMinor - previousBalanceMinor;
    if (Math.abs(amountMinor) !== block.sourceAmountMinor) {
      throw new Error(
        `Naranja X balance delta mismatch for operation ${block.sourceTransactionId}`,
      );
    }

    transactions.push({
      sourceTransactionId: block.sourceTransactionId,
      occurredOn: toIsoDate(statementYear, block.month, block.day),
      description: block.description,
      sourceAmountMinor: block.sourceAmountMinor,
      amountMinor,
      balanceAfterMinor: block.balanceAfterMinor,
      currency,
    });
    previousBalanceMinor = block.balanceAfterMinor;
  }

  return {
    currency,
    statementClosed: statementClosingBalanceMinor != null,
    openingBalanceMinor,
    statementClosingBalanceMinor,
    derivedClosingBalanceMinor: previousBalanceMinor,
    transactions,
    duplicateSourceTransactionIds: [...new Set(duplicates)],
    reconciliationDifferenceMinor:
      statementClosingBalanceMinor == null
        ? null
        : previousBalanceMinor - statementClosingBalanceMinor,
  };
}

export function parseNaranjaXStatementText(
  statementText: string,
  statementYear: number,
): NaranjaStatementResult {
  if (!Number.isInteger(statementYear) || statementYear < 2000 || statementYear > 2100) {
    throw new RangeError('statementYear must be a four-digit year between 2000 and 2100');
  }

  const sections = (['ARS', 'USD'] as const)
    .map((currency) => parseSection(statementText, currency, statementYear))
    .filter((section): section is NaranjaSectionResult => section !== null);

  if (sections.length === 0) {
    throw new Error('No supported Naranja X account sections found');
  }

  return { sections };
}
