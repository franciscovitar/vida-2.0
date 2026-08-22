import { Workflow } from 'lucide-react';
import type { Metadata } from 'next';

import { AutomationsDashboard } from '@/components/automations/AutomationsDashboard';
import { PageHeader } from '@/components/layout/PageHeader';
import { requireAuthorizedSession } from '@/lib/auth/dal';
import { getAutomationsDashboardData } from '@/lib/automations/dashboard';

export const metadata: Metadata = { title: 'Automatizaciones' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function AutomatizacionesPage() {
  await requireAuthorizedSession();
  const data = await getAutomationsDashboardData();
  return (
    <div>
      <PageHeader
        title="Automatizaciones"
        description="Workflows programados con identidad acotada, artefactos sanitizados y control humano."
        icon={Workflow}
        domain="productivity"
      />
      <AutomationsDashboard data={data} />
    </div>
  );
}
