import { Inbox } from 'lucide-react';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { requireAuthorizedSession } from '@/lib/auth/dal';

import styles from './page.module.scss';

export const metadata: Metadata = { title: 'Bandeja de entrada' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function BandejaPage() {
  await requireAuthorizedSession();

  return (
    <div>
      <PageHeader
        title="Bandeja de entrada"
        description="Superficie de revisión. La captura cotidiana se mueve a canales conversacionales."
        icon={Inbox}
        domain="neutral"
      />
      <div className={styles.wrapper}>
        <Card>
          <SectionHeader
            title="Captura conversacional"
            description="ChatGPT es el primer canal; Telegram y WhatsApp podrán sumarse sin convertir la web en un formulario."
            icon={Inbox}
            domain="neutral"
          />
          <p>
            Esta pantalla no crea capturas ni borradores. Vida Web queda orientada a revisar y
            entender lo ya registrado; la entrada se estructura y enruta fuera de la web hacia la
            fuente canónica correspondiente.
          </p>
        </Card>
      </div>
    </div>
  );
}
