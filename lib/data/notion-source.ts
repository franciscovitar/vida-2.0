/**
 * Fuente de datos Notion para páginas (mock | notion con fallback seguro).
 * Independiente de Google Sheets.
 */
import { cache } from 'react';
import 'server-only';

import { todayInBuenosAires } from '@/lib/adapters/dates';
import { buildMockNotionDashboard } from '@/lib/mock-data/notion';
import { getNotionConfig, getNotionDataSource } from '@/lib/notion/config';
import { createNotionReadPort } from '@/lib/notion/client';
import { notionNoticeFor, type NotionReadCode } from '@/lib/notion/errors';
import { loadNotionDashboardFromPort } from '@/lib/notion/queries';
import { buildNotionHoyPreview, summarizeProjects, summarizeTasks } from '@/lib/notion/summaries';
import type { NotionDashboardData, NotionHoyPreview } from '@/types/notion';

function mockBundle(
  today: string,
  status: NotionDashboardData['status'],
  notice: string | null,
): NotionDashboardData {
  const base = buildMockNotionDashboard(today);
  return {
    ...base,
    source: status === 'mock' ? 'mock' : 'notion',
    status,
    notice,
    syncedAt: new Date().toISOString(),
    taskSummary: summarizeTasks(base.tasks),
    projectSummary: summarizeProjects(base.projects),
  };
}

function fallbackFromCode(today: string, code: NotionReadCode): NotionDashboardData {
  if (code === 'forbidden-data-source') {
    return mockBundle(today, 'missing-data-source', notionNoticeFor('missing-data-source'));
  }
  if (code === 'not-configured') {
    return mockBundle(today, 'not-configured', notionNoticeFor('not-configured'));
  }
  const noticeCode =
    code === 'auth-error' ||
    code === 'permission-error' ||
    code === 'missing-data-source' ||
    code === 'missing-property' ||
    code === 'rate-limited' ||
    code === 'network-error'
      ? code
      : 'read-error';
  return mockBundle(today, noticeCode, notionNoticeFor(noticeCode));
}

async function loadNotionDashboard(): Promise<NotionDashboardData> {
  const today = todayInBuenosAires();

  if (getNotionDataSource() !== 'notion') {
    return mockBundle(today, 'mock', null);
  }

  const configResult = getNotionConfig();
  if (!configResult.ok) {
    return fallbackFromCode(today, configResult.reason);
  }

  try {
    const port = createNotionReadPort(configResult.config.token);
    const result = await loadNotionDashboardFromPort(
      port,
      configResult.config,
      today,
      new Date().toISOString(),
    );
    if (!result.ok) return fallbackFromCode(today, result.code);
    if (result.data.status === 'empty') {
      return {
        ...result.data,
        notice: notionNoticeFor('empty'),
      };
    }
    return result.data;
  } catch {
    return fallbackFromCode(today, 'read-error');
  }
}

/** Cache por request: una carga para /tareas y /proyectos. */
export const getNotionDashboard = cache(loadNotionDashboard);

/** Contrato preparado para Hoy (sin cablear la UI todavía). */
export async function getNotionHoyPreview(): Promise<NotionHoyPreview> {
  const data = await getNotionDashboard();
  return buildNotionHoyPreview(data);
}

export { buildNotionHoyPreview };
