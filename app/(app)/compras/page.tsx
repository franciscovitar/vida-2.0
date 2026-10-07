import { Home, ShoppingCart } from 'lucide-react';
import type { Metadata } from 'next';

import pageStyles from '@/app/(app)/page.module.scss';
import { PageHeader } from '@/components/layout/PageHeader';
import { PersonalShoppingWorkspace } from '@/components/personal-shopping/PersonalShoppingWorkspace';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { requireAuthorizedSession } from '@/lib/auth/dal';
import { getPersonalShoppingRuntime } from '@/lib/personal-shopping/runtime';
import type { PersonalShoppingSnapshot } from '@/lib/personal-shopping/service';

export const metadata: Metadata = { title: 'Compras' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function readShoppingSnapshot(): Promise<
  { ok: true; snapshot: PersonalShoppingSnapshot } | { ok: false }
> {
  const shopping = getPersonalShoppingRuntime();
  if (shopping.state !== 'ready') return { ok: false };

  try {
    return { ok: true, snapshot: await shopping.service.snapshot() };
  } catch {
    return { ok: false };
  }
}

export default async function ComprasPage() {
  await requireAuthorizedSession();
  const shopping = getPersonalShoppingRuntime();
  const snapshotResult = shopping.state === 'ready' ? await readShoppingSnapshot() : null;

  let content;
  if (shopping.state !== 'ready') {
    content = (
      <Card>
        <strong>Compras personales todavía no está operativa en este entorno.</strong>
        <p>{shopping.notice}</p>
      </Card>
    );
  } else if (!snapshotResult?.ok) {
    content = (
      <Card>
        <strong>No pudimos leer tus compras personales.</strong>
        <p>
          La lista no fue reemplazada por datos inventados. Probá de nuevo en unos minutos.
        </p>
      </Card>
    );
  } else {
    content = (
      <PersonalShoppingWorkspace
        initialSnapshot={snapshotResult.snapshot}
        writesEnabled={shopping.writesEnabled}
      />
    );
  }

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Compras"
        description="Capturá necesidades, investigá con intención y decidí sin mezclar la casa con tus finanzas."
        icon={ShoppingCart}
        action={
          <Button href="/hogar/reposicion" variant="secondary" iconLeft={Home}>
            Lista de casa · compartida
          </Button>
        }
      />
      {content}
    </div>
  );
}
