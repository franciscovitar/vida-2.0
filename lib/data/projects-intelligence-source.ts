/**
 * Fuente de datos Projects Intelligence (lectura, V1). Requiere sesión Auth
 * autorizada. Independiente del dashboard genérico de Notion
 * (`lib/data/notion-source.ts`): no lo reemplaza ni lo modifica.
 */
import 'server-only';

import { requireAuthorizedSession } from '@/lib/auth/dal';
import { loadProjectsIntelligence } from '@/lib/notion/projects-intelligence';

/** Una carga protegida para la futura UI de `/proyectos` (Projects Intelligence). */
export async function getProjectsIntelligence() {
  await requireAuthorizedSession();
  return loadProjectsIntelligence();
}
