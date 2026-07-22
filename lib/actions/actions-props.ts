/**
 * Propiedades canónicas de la base Acciones y propuestas (setup externo Work).
 * No inventar nombres; deben coincidir exactamente con Notion.
 */
export const ACTIONS_PROPS = {
  title: 'Nombre',
  actionType: 'actionType',
  targetType: 'targetType',
  targetKey: 'targetKey',
  status: 'status',
  confirmationMode: 'confirmationMode',
  risk: 'risk',
  reversible: 'reversible',
  payloadSanitized: 'payloadSanitized',
  beforeSummary: 'beforeSummary',
  afterSummary: 'afterSummary',
  idempotencyKey: 'idempotencyKey',
  createdAt: 'createdAt',
  decidedAt: 'decidedAt',
  appliedAt: 'appliedAt',
  resultCode: 'resultCode',
} as const;

export const ACTIONS_PROP_NAMES: readonly string[] = Object.values(ACTIONS_PROPS);

export const PROPOSAL_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'applied',
  'failed',
  'expired',
] as const;

/**
 * Marcadores internos en payloadSanitized (_ledger).
 * No son valores de select de Notion (evita depender de opciones no creadas en setup).
 */
export const LEDGER_KIND = {
  idempotency: 'idempotency',
  audit: 'audit',
} as const;
