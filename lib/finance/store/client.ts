import 'server-only';

import { requireFinanceAccess } from '@/lib/finance/access';
import { getFinanceStoreConfig } from '@/lib/finance/store/config';
import {
  buildFinanceRestUrl,
  financeMethodAllowed,
  type FinanceHttpMethod,
  type FinanceTable,
  withFinanceOwner,
} from '@/lib/finance/store/request-core';

export type FinanceStoreFailureCode =
  | 'disabled'
  | 'not-configured'
  | 'writes-disabled'
  | 'network-error'
  | 'store-error'
  | 'invalid-response';

export type FinanceStoreResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: FinanceStoreFailureCode; status?: number };

interface FinanceRequestOptions {
  method?: FinanceHttpMethod;
  query?: URLSearchParams;
  body?: Record<string, unknown> | Record<string, unknown>[];
  prefer?: string;
}

function attachOwner(
  ownerKey: string,
  body: FinanceRequestOptions['body'],
): FinanceRequestOptions['body'] {
  if (!body) return undefined;
  return Array.isArray(body)
    ? body.map((item) => withFinanceOwner(ownerKey, item))
    : withFinanceOwner(ownerKey, body);
}

/**
 * Minimal PostgREST adapter for the dedicated Finance Supabase project.
 *
 * It always:
 * - verifies the Vida owner session first;
 * - scopes requests by FINANCE_OWNER_KEY;
 * - keeps the service-role credential server-only;
 * - fails closed for writes unless FINANCE_WRITES_ENABLED=true;
 * - omits private response bodies from error objects/logging.
 */
export async function financeStoreRequest<T>(
  table: FinanceTable,
  options: FinanceRequestOptions = {},
): Promise<FinanceStoreResult<T>> {
  await requireFinanceAccess();

  const config = getFinanceStoreConfig();
  if (config.status === 'disabled') return { ok: false, code: 'disabled' };
  if (config.status !== 'ready') return { ok: false, code: 'not-configured' };

  const method = options.method ?? 'GET';
  if (!financeMethodAllowed(config, method)) {
    return { ok: false, code: 'writes-disabled' };
  }

  const url = buildFinanceRestUrl(config, table, options.query);
  const body = attachOwner(config.ownerKey, options.body);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.prefer ? { Prefer: options.prefer } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch {
    return { ok: false, code: 'network-error' };
  }

  if (!response.ok) {
    return { ok: false, code: 'store-error', status: response.status };
  }

  const text = await response.text();
  if (!text) return { ok: true, data: undefined as T };

  try {
    return { ok: true, data: JSON.parse(text) as T };
  } catch {
    return {
      ok: false,
      code: 'invalid-response',
      status: response.status,
    };
  }
}
