import { CalendarClock } from 'lucide-react';
import type { Metadata } from 'next';

import { AgendaBoard } from '@/components/calendar/AgendaBoard';
import { AgendaViewSwitcher } from '@/components/calendar/AgendaViewSwitcher';
import { CalendarIntegrationNotice } from '@/components/calendar/CalendarIntegrationNotice';
import { PageHeader } from '@/components/layout/PageHeader';
import { formatArgentineFullDate } from '@/lib/adapters/dates';
import { getCalendarAgenda, parseAgendaView } from '@/lib/data/calendar-source';

import pageStyles from '../page.module.scss';
import local from './page.module.scss';

export const metadata: Metadata = { title: 'Agenda' };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function sourceLabel(source: 'mock' | 'google', status: string): string {
  if (source === 'mock' || status === 'mock') return 'Mock';
  if (status === 'ready' || status === 'empty') return 'Google Calendar';
  return 'Calendar (fallback mock)';
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const view = parseAgendaView(params.view);
  const data = await getCalendarAgenda(view);

  const periodLabel =
    data.view === 'today'
      ? formatArgentineFullDate(data.targetDate)
      : `${formatArgentineFullDate(data.rangeStart)} – ${formatArgentineFullDate(data.rangeEnd)}`;

  return (
    <div className={`${pageStyles.page} ${local.page}`}>
      <PageHeader
        title="Agenda"
        description={`${sourceLabel(data.source, data.status)} · ${data.summary.totalEvents} eventos · ${periodLabel}`}
        icon={CalendarClock}
        domain="productivity"
      />

      {data.notice ? (
        <CalendarIntegrationNotice status={data.status} message={data.notice} />
      ) : null}

      <p className={local.meta}>
        <span>Fuente: {sourceLabel(data.source, data.status)}</span>
        <span>Estado: {data.status}</span>
        <span>Zona: {data.timezone}</span>
        <span className="tabular">{data.summary.totalEvents} eventos</span>
        <span>Calendarios: {data.calendarIds.join(', ')}</span>
      </p>

      <AgendaViewSwitcher view={data.view} />
      <AgendaBoard data={data} />
    </div>
  );
}
