/**
 * Configuración Notion desde variables de entorno (solo servidor).
 * No registra ni expone el token.
 */
import { ALLOWED_NOTION_DATA_SOURCE_IDS, NOTION_DATABASES } from '@/lib/notion/constants';
import type { NotionDataSourceMode } from '@/types/notion';

export function getNotionDataSource(
  env: Readonly<Record<string, string | undefined>> = process.env,
): NotionDataSourceMode {
  return env.NOTION_DATA_SOURCE === 'notion' ? 'notion' : 'mock';
}

export interface NotionConfig {
  token: string;
  tasksDataSourceId: string;
  projectsDataSourceId: string;
  areasDataSourceId: string;
}

export type NotionConfigResult =
  | { ok: true; config: NotionConfig }
  | { ok: false; reason: 'not-configured' | 'forbidden-data-source' };

/** true solo si el ID está en la lista blanca de Fase 4A. */
export function isAllowedNotionDataSourceId(id: string): boolean {
  return ALLOWED_NOTION_DATA_SOURCE_IDS.includes(id);
}

/**
 * Lee la configuración. Sin token → not-configured.
 * Con IDs fuera de lista blanca → forbidden-data-source.
 */
export function getNotionConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): NotionConfigResult {
  const token = env.NOTION_API_TOKEN?.trim();
  if (!token) return { ok: false, reason: 'not-configured' };

  const tasksDataSourceId =
    env.NOTION_TASKS_DATA_SOURCE_ID?.trim() || NOTION_DATABASES.tasks.dataSourceId;
  const projectsDataSourceId =
    env.NOTION_PROJECTS_DATA_SOURCE_ID?.trim() || NOTION_DATABASES.projects.dataSourceId;
  const areasDataSourceId =
    env.NOTION_AREAS_DATA_SOURCE_ID?.trim() || NOTION_DATABASES.areas.dataSourceId;

  if (
    !isAllowedNotionDataSourceId(tasksDataSourceId) ||
    !isAllowedNotionDataSourceId(projectsDataSourceId) ||
    !isAllowedNotionDataSourceId(areasDataSourceId)
  ) {
    return { ok: false, reason: 'forbidden-data-source' };
  }

  return {
    ok: true,
    config: {
      token,
      tasksDataSourceId,
      projectsDataSourceId,
      areasDataSourceId,
    },
  };
}
