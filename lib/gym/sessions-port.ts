/**
 * Puerto conceptual read-only de sesiones (preparación 8E).
 * Sin create/update/delete/append.
 */
import type { GymSession, GymSessionSummary } from '@/types/gym';

export type GymSessionListQuery = {
  from?: string;
  to?: string;
};

/** Solo lectura. Escrituras quedan fuera de 8D.2. */
export interface GymSessionReadPort {
  listSessions(query?: GymSessionListQuery): Promise<readonly GymSessionSummary[]>;
  getSession(key: string): Promise<GymSession | null>;
}

/** Implementación deshabilitada: sin datos estructurados todavía. */
export const disabledGymSessionReadPort: GymSessionReadPort = {
  async listSessions() {
    return [];
  },
  async getSession() {
    return null;
  },
};

export const GYM_SESSIONS_PENDING_NOTICE =
  'Registro detallado de sesiones pendiente de habilitación segura';
