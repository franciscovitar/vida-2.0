/**
 * Resolución pura del target Google Sheets (DEV | PROD).
 *
 * Sin I/O. Sin hardcodes de Spreadsheet ID.
 * Solo debe usarse desde módulos de servidor (vía config / spreadsheet-target).
 *
 * Compatibilidad temporal: si GOOGLE_SHEETS_TARGET está ausente y existe
 * GOOGLE_SHEETS_DEV_ID, se resuelve a `dev`. Nunca a `prod`.
 */
export type SheetsTargetName = 'dev' | 'prod';

export type SpreadsheetTargetOk = {
  ok: true;
  target: SheetsTargetName;
  spreadsheetId: string;
  /** Valor crudo de GOOGLE_SHEETS_ALLOW_PROD_WRITES === 'true'. */
  allowProdWrites: boolean;
  /** true si las escrituras de hábitos están permitidas para este target. */
  writesAllowed: boolean;
};

export type SpreadsheetTargetFailReason =
  'invalid-target' | 'missing-id' | 'prod-forbidden-in-env' | 'not-configured';

export type SpreadsheetTargetFail = {
  ok: false;
  reason: SpreadsheetTargetFailReason;
};

export type SpreadsheetTargetResult = SpreadsheetTargetOk | SpreadsheetTargetFail;

/** Subconjunto de env relevante (inyectable en tests). */
export type SpreadsheetTargetEnv = {
  GOOGLE_SHEETS_TARGET?: string;
  GOOGLE_SHEETS_DEV_ID?: string;
  GOOGLE_SHEETS_PROD_ID?: string;
  GOOGLE_SHEETS_ALLOW_PROD_WRITES?: string;
  VERCEL_ENV?: string;
  /**
   * Solo tests: exactamente "1" permite resolver target=prod fuera de
   * VERCEL_ENV=production. Nunca usar en Preview/Production reales.
   */
  SHEETS_ALLOW_PROD_TARGET_FOR_TESTS?: string;
  [key: string]: string | undefined;
};

function trimOrEmpty(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function vercelEnv(env: SpreadsheetTargetEnv): string {
  return trimOrEmpty(env.VERCEL_ENV);
}

function allowProdTargetForTests(env: SpreadsheetTargetEnv): boolean {
  return trimOrEmpty(env.SHEETS_ALLOW_PROD_TARGET_FOR_TESTS) === '1';
}

/**
 * ¿Se admite resolver lectura (y potencial escritura) contra target=prod?
 * - VERCEL_ENV=production → sí
 * - VERCEL_ENV=preview → nunca
 * - flag de tests → sí (solo harness)
 * - NODE_ENV / entorno local ambiguo → no
 */
export function isProdTargetEnvironmentAllowed(env: SpreadsheetTargetEnv): boolean {
  const v = vercelEnv(env);
  if (v === 'preview') return false;
  if (v === 'production') return true;
  return allowProdTargetForTests(env);
}

export function isProdWritesAllowed(env: SpreadsheetTargetEnv): boolean {
  return (
    vercelEnv(env) === 'production' && trimOrEmpty(env.GOOGLE_SHEETS_ALLOW_PROD_WRITES) === 'true'
  );
}

/**
 * Resuelve target + ID sin filtrar secretos en el resultado de error.
 * El campo spreadsheetId del éxito es solo para uso server-side interno.
 */
export function resolveSpreadsheetTarget(env: SpreadsheetTargetEnv): SpreadsheetTargetResult {
  const rawTarget = trimOrEmpty(env.GOOGLE_SHEETS_TARGET);
  const devId = trimOrEmpty(env.GOOGLE_SHEETS_DEV_ID);
  const prodId = trimOrEmpty(env.GOOGLE_SHEETS_PROD_ID);
  const allowProdWrites = trimOrEmpty(env.GOOGLE_SHEETS_ALLOW_PROD_WRITES) === 'true';

  // Compatibilidad temporal: target ausente → DEV si hay ID (nunca prod).
  let target: SheetsTargetName;
  if (rawTarget === '') {
    if (!devId) {
      return { ok: false, reason: 'not-configured' };
    }
    target = 'dev';
  } else if (rawTarget === 'dev' || rawTarget === 'prod') {
    target = rawTarget;
  } else {
    return { ok: false, reason: 'invalid-target' };
  }

  if (target === 'dev') {
    if (!devId) return { ok: false, reason: 'missing-id' };
    return {
      ok: true,
      target: 'dev',
      spreadsheetId: devId,
      allowProdWrites,
      // DEV: allow prod no tiene efecto; escritura de hábitos permitida a nivel target.
      writesAllowed: true,
    };
  }

  // target === 'prod'
  if (!isProdTargetEnvironmentAllowed(env)) {
    return { ok: false, reason: 'prod-forbidden-in-env' };
  }
  if (!prodId) return { ok: false, reason: 'missing-id' };

  return {
    ok: true,
    target: 'prod',
    spreadsheetId: prodId,
    allowProdWrites,
    writesAllowed: isProdWritesAllowed(env),
  };
}
