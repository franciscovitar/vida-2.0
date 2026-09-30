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
  openingBalanceMinor: number;
  statementClosingBalanceMinor: number;
  derivedClosingBalanceMinor: number;
  transactions: NaranjaParsedTransaction[];
  duplicateSourceTransactionIds: string[];
  reconciliationDifferenceMinor: number;
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

function extractBalance(section: string, currency: NaranjaCurrency, kind: 'initial' | 'final'): number {
  const label = kind === 'initial' ? 'Dinero total inicial' : 'Dinero total final';
  const currencyPattern = currency === 'ARS' ? '\\$' : 'USD';
  const regex = new RegExp(
    `${label}\\s+${currencyPattern}\\s*([\\d.]+,\\d{2})`,
    'i',
  );
  const match = section.match(regex);
  if (!match) {
    throw new Error(`Missing Naranja X ${currency} ${kind} balance`);
  }
  return parseMoneyMinor(match[1]);
}

function parseBlocks(section: string, currency: NaranjaCurrency): ParsedBlock[] {
  const unit = currency === 'ARS' ? '\\$' : 'USD';
  const linePattern = new RegExp(
    `^(\\d{2})/([A-ZÁÉÍÓÚÑ]{3})\\s+(\\d{10,13})\\s+(.+?)\\s+${unit}\\s*([\\d.]+,\\d{2})\\s+${unit}\\s*([\\d.]+,\\d{2})\\s*$`,
    'u',
  );

  const blocks: ParsedBlock[] = [];
  let current: ParsedBlock | null = null;

  for (const rawLine of section.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = line.match(linePattern);
    if (match) {
      if (current) blocks.push(current);

      const month = MONTH_BY_CODE[match[2]];
      if (!month) throw new Error(`Unknown Naranja X month code: ${match[2]}`);

      current = {
        day: Number.parseInt(match[1], 10),
        month,
        sourceTransactionId: match[3],
        description: match[4].trim(),
        sourceAmountMinor: parseMoneyMinor(match[5]),
        balanceAfterMinor: parseMoneyMinor(match[6]),
      };
      continue;
    }

    if (
      current &&
      !line.startsWith('Dinero final') &&
      !line.startsWith('Resumen del mes') &&
      !line.startsWith('Movimientos del mes') &&
      !line.startsWith('Nº de') &&
      !line.startsWith('Fecha ') &&
      !line.startsWith('operación ') &&
      !line.startsWith('Dinero inicial')
    ) {
      current.description = `${current.description} ${line}`.replace(/\s+/g, ' ').trim();
    }
  }

  if (current) blocks.push(current);
  return blocks;
}

function parseSection(
  statementText: string,
  currency: NaranjaCurrency,
  statementYear: number,
): NaranjaSectionResult | null {
  const section = extractSection(statementText, currency);
  if (!section) return null;

  const openingBalanceMinor = extractBalance(section, currency, 'initial');
  const statementClosingBalanceMinor = extractBalance(section, currency, 'final');
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
    openingBalanceMinor,
    statementClosingBalanceMinor,
    derivedClosingBalanceMinor: previousBalanceMinor,
    transactions,
    duplicateSourceTransactionIds: [...new Set(duplicates)],
    reconciliationDifferenceMinor: previousBalanceMinor - statementClosingBalanceMinor,
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
