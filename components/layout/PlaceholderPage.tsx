import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { EmptyState } from '@/components/ui/EmptyState';
import type { Domain } from '@/types';

import { PageHeader } from './PageHeader';

interface PlaceholderPageProps {
  title: string;
  description: string;
  icon: LucideIcon;
  domain: Domain;
  emptyTitle: string;
  emptyDescription: string;
  /** Vista previa de lo que mostrará la sección con datos reales. */
  preview: string[];
  action?: ReactNode;
}

/**
 * Página aún no desarrollada: mantiene el layout compartido y muestra un
 * estado vacío cuidado que anticipa el contenido futuro.
 */
export function PlaceholderPage({
  title,
  description,
  icon,
  domain,
  emptyTitle,
  emptyDescription,
  preview,
  action,
}: PlaceholderPageProps) {
  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        icon={icon}
        domain={domain}
        action={action}
      />
      <EmptyState icon={icon} title={emptyTitle} description={emptyDescription} preview={preview} />
    </div>
  );
}
