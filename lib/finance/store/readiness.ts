import 'server-only';

import { getFinanceStoreConfig } from '@/lib/finance/store/config';
import { readFinanceSheet } from '@/lib/finance/store/client';
import { validateFinanceMeta } from '@/lib/finance/store/meta-core';

export type FinanceStoreReadinessSnapshot =
  | {
      status: 'connected';
      label: 'Store conectado · solo lectura';
      writesEnabled: false;
      schemaVersion: string;
    }
  | {
      status: 'unavailable';
      label:
        | 'Store financiero deshabilitado'
        | 'Store financiero no configurado'
        | 'No se pudo leer el store financiero'
        | 'Schema financiero inválido'
        | 'Escrituras financieras activas: revisión requerida';
    };

export async function getFinanceStoreReadinessSnapshot(): Promise<FinanceStoreReadinessSnapshot> {
  const config = getFinanceStoreConfig();

  if (config.status === 'disabled') {
    return { status: 'unavailable', label: 'Store financiero deshabilitado' };
  }
  if (config.status !== 'ready') {
    return { status: 'unavailable', label: 'Store financiero no configurado' };
  }

  if (config.writesEnabled) {
    return {
      status: 'unavailable',
      label: 'Escrituras financieras activas: revisión requerida',
    };
  }

  const meta = await readFinanceSheet('meta');
  if (!meta.ok) {
    return { status: 'unavailable', label: 'No se pudo leer el store financiero' };
  }

  const validated = validateFinanceMeta(meta.values);
  if (!validated.ok || validated.declaredWritesEnabled) {
    return { status: 'unavailable', label: 'Schema financiero inválido' };
  }

  return {
    status: 'connected',
    label: 'Store conectado · solo lectura',
    writesEnabled: false,
    schemaVersion: validated.schemaVersion,
  };
}
