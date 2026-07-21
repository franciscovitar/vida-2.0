/**
 * Carga del dashboard Notion (mock | real con fallback).
 * Sin `server-only` para poder reutilizarla desde getTodayData en tests.
 * El cliente SDK se importa solo en modo notion.
 */
import { cache } from 'react';

import { todayInBuenosAires } from '@/lib/adapters/dates';
import { buildMockNotionDashboard } from '@/lib/mock-data/notion';
import { getNotionConfig, getNotionDataSource } from '@/lib/notion/config';
import { notionNoticeFor, type NotionReadCode } from '@/lib/notion/errors';
import { buildNotionHoyPreview, summarizeProjects, summarizeTasks } from '@/lib/notion/summaries';
import type { NotionDashboardData } from '@/types/notion';

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

async function loadNotionDashboardUncached(): Promise<NotionDashboardData> {
  const today = todayInBuenosAires();

  if (getNotionDataSource() !== 'notion') {
    return mockBundle(today, 'mock', null);
  }

  const configResult = getNotionConfig();
  if (!configResult.ok) {
    return fallbackFromCode(today, configResult.reason);
  }

  try {
    const { createNotionReadPort } = await import('@/lib/notion/client');
    const { loadNotionDashboardFromPort } = await import('@/lib/notion/queries');
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

/** Una carga por request (Hoy + /tareas + /proyectos). */
export const loadNotionDashboard = cache(loadNotionDashboardUncached);

export async function loadNotionHoyPreview() {
  const data = await loadNotionDashboard();
  return buildNotionHoyPreview(data);
}
