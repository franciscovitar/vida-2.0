import 'server-only';

import { GoogleSheetsPersonalShoppingRepository } from './google-sheets-store';
import type { PersonalShoppingRepository } from './repository';
import { resolvePersonalShoppingStoreConfig } from './sheets-config';

export type PersonalShoppingRuntime =
  | { state: 'disabled'; notice: string }
  | { state: 'not-configured'; notice: string }
  | {
      state: 'ready';
      repository: PersonalShoppingRepository;
      writesEnabled: boolean;
    };

export function getPersonalShoppingRuntime(
  env: Readonly<Record<string, string | undefined>> = process.env,
): PersonalShoppingRuntime {
  const config = resolvePersonalShoppingStoreConfig(env);

  if (config.status === 'disabled') {
    return {
      state: 'disabled',
      notice: 'Compras personales estructuradas todavía no están habilitadas en este entorno.',
    };
  }

  if (config.status !== 'ready') {
    return {
      state: 'not-configured',
      notice: 'Falta completar la configuración del store personal de Compras.',
    };
  }

  return {
    state: 'ready',
    repository: new GoogleSheetsPersonalShoppingRepository(config),
    writesEnabled: config.writesEnabled,
  };
}
