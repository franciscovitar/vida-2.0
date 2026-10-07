import { WalletCards } from 'lucide-react';
import type { Metadata } from 'next';

import pageStyles from '@/app/(app)/page.module.scss';
import { FinanceMovementsBrowser } from '@/components/finance/FinanceMovementsBrowser';
import { FinanceNavigation } from '@/components/finance/FinanceNavigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import {
  filterFinanceMovements,
  type FinanceMovementFilters,
  type FinanceMovementKind,
} from '@/lib/finance/movements-core';
import { getFinanceMovementsSnapshot } from '@/lib/finance/movements-store';

export const metadata: Metadata = { title: 'Movimientos · Finanzas' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function scalar(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function kind(value: string): 'all' | FinanceMovementKind {
  if (value === 'income' || value === 'expense' || value === 'transfer' || value === 'other') {
    return value;
  }
  return 'all';
}

export default async function FinanceMovementsPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string | string[];
    q?: string | string[];
    type?: string | string[];
    category?: string | string[];
    source?: string | string[];
  }>;
}) {
  const [snapshot, params] = await Promise.all([getFinanceMovementsSnapshot(), searchParams]);

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Finanzas"
        description="Entendé tu mes, tus movimientos y tus decisiones."
        icon={WalletCards}
        domain="finance"
      />

      <FinanceNavigation current="movements" />

      {snapshot.ok ? (
        (() => {
          const requestedMonth = scalar(params.month);
          const month = snapshot.model.months.includes(requestedMonth)
            ? requestedMonth
            : snapshot.model.months[0] ?? '';

          const filters: FinanceMovementFilters & { month: string } = {
            month,
            query: scalar(params.q),
            kind: kind(scalar(params.type)),
            category: scalar(params.category),
            source: scalar(params.source),
          };
          const movements = filterFinanceMovements(snapshot.model.movements, filters);

          return (
            <FinanceMovementsBrowser
              model={snapshot.model}
              filters={filters}
              movements={movements}
            />
          );
        })()
      ) : (
        <Card>
          <h2>No pudimos leer los movimientos ahora</h2>
          <p>
            Tus datos no fueron reemplazados por valores simulados. Probá de nuevo más tarde o
            revisá “Datos y fuentes”.
          </p>
        </Card>
      )}
    </div>
  );
}
