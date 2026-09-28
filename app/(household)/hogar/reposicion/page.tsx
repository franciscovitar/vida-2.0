import type { Metadata } from 'next';

import { ShoppingList } from '@/components/household-replenishment/ShoppingList';
import { requireHouseholdAccess } from '@/lib/household-replenishment/access';
import { getHouseholdReplenishmentRuntime } from '@/lib/household-replenishment/runtime';

import styles from './page.module.scss';

export const metadata: Metadata = { title: 'Lista del hogar' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function HouseholdReplenishmentPage() {
  const access = await requireHouseholdAccess();
  const householdRuntime = getHouseholdReplenishmentRuntime();

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>Reposición del hogar</p>
        <h1>Lista de casa</h1>
        <p>
          Una lista compartida que aprende de las compras y de correcciones simples, sin llevar
          inventario exacto.
        </p>
      </header>

      {householdRuntime.state === 'ready' ? (
        <ShoppingList
          initialSnapshot={await householdRuntime.service.snapshot(access.householdId)}
        />
      ) : (
        <section className={styles.unavailable}>
          <strong>Todavía no está operativo en este entorno.</strong>
          <p>{householdRuntime.notice}</p>
        </section>
      )}
    </div>
  );
}
