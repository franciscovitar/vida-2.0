import type { Metadata } from 'next';
import { LibraryBig } from 'lucide-react';

import { CapabilitiesLibrary } from '@/components/learning/CapabilitiesLibrary';
import { PageHeader } from '@/components/layout/PageHeader';
import { requireAuthorizedSession } from '@/lib/auth/dal';
import { getCapabilityLibrary } from '@/lib/learning/capabilities-source';
import pageStyles from '../page.module.scss';

export const metadata: Metadata = { title: 'Explorar capacidades' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function CapabilitiesPage() {
  await requireAuthorizedSession();
  const library = await getCapabilityLibrary();
  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Explorar capacidades"
        description="Una biblioteca opcional para mirar posibilidades a tu ritmo. Explorar no inicia un plan de estudio."
        icon={LibraryBig}
        domain="learning"
      />
      <CapabilitiesLibrary library={library} />
    </div>
  );
}
