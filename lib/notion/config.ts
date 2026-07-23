/**
 * Configuración Notion desde variables de entorno (solo servidor).
 * No registra ni expone tokens o referencias internas.
 */
import type { NotionDataSourceMode } from '@/types/notion';

type Env = Readonly<Record<string, string | undefined>>;

export function getNotionDataSource(env: Env = process.env): NotionDataSourceMode {
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

const NOTION_ID_PATTERN =
  /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

function configuredDataSourceIds(env: Env): string[] | null {
  const ids = [
    env.NOTION_TASKS_DATA_SOURCE_ID?.trim(),
    env.NOTION_PROJECTS_DATA_SOURCE_ID?.trim(),
    env.NOTION_AREAS_DATA_SOURCE_ID?.trim(),
  ];

  if (ids.some((id) => !id)) return null;
  const resolved = ids as string[];
  if (resolved.some((id) => !NOTION_ID_PATTERN.test(id))) return [];
  if (new Set(resolved.map((id) => id.toLowerCase())).size !== resolved.length) return [];
  return resolved;
}

/** true solo si el ID coincide con una referencia explícita del entorno actual. */
export function isAllowedNotionDataSourceId(id: string, env: Env = process.env): boolean {
  const configured = configuredDataSourceIds(env);
  if (!configured || configured.length !== 3) return false;
  const normalized = id.trim().toLowerCase();
  return configured.some((candidate) => candidate.toLowerCase() === normalized);
}

/**
 * Lee configuración explícita. No usa IDs hardcodeados ni fallback entre recursos.
 */
export function getNotionConfig(env: Env = process.env): NotionConfigResult {
  const token = env.NOTION_API_TOKEN?.trim();
  if (!token) return { ok: false, reason: 'not-configured' };

  const configured = configuredDataSourceIds(env);
  if (configured === null) return { ok: false, reason: 'not-configured' };
  if (configured.length !== 3) return { ok: false, reason: 'forbidden-data-source' };

  const [tasksDataSourceId, projectsDataSourceId, areasDataSourceId] = configured;
  return {
    ok: true,
    config: {
      token,
      tasksDataSourceId: tasksDataSourceId!,
      projectsDataSourceId: projectsDataSourceId!,
      areasDataSourceId: areasDataSourceId!,
    },
  };
}
