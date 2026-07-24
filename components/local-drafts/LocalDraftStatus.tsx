'use client';

import { HardDrive, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import type { LocalDraftController } from '@/lib/local-drafts/use-local-draft-backup';

import styles from './LocalDraftStatus.module.scss';

function savedLabel(savedAt: string | null): string | null {
  if (!savedAt) return null;
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

export function LocalDraftStatus({
  controller,
  hasContent,
  label = 'borrador',
}: {
  controller: LocalDraftController;
  hasContent: boolean;
  label?: string;
}) {
  const at = savedLabel(controller.savedAt);
  const headline =
    controller.state === 'loading'
      ? 'Revisando guardado local…'
      : controller.state === 'restored'
        ? `${label.charAt(0).toUpperCase()}${label.slice(1)} recuperado`
        : controller.state === 'saved'
          ? 'Cambios guardados en este navegador'
          : controller.state === 'error'
            ? 'Guardado local no disponible'
            : 'Sin borrador guardado';

  return (
    <aside className={styles.status} data-state={controller.state} aria-live="polite">
      <div className={styles['status-main']}>
        <HardDrive size={18} strokeWidth={2} aria-hidden="true" />
        <div>
          <strong>{headline}</strong>
          <span>
            {controller.error ??
              (at ? `Última copia: ${at}.` : 'Se activa cuando agregás contenido al borrador.')}
          </span>
        </div>
      </div>
      {hasContent ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          iconLeft={Trash2}
          className={styles['clear-button']}
          onClick={controller.clear}
        >
          Eliminar copia local
        </Button>
      ) : null}
      <small>
        Se conserva hasta 30 días en este perfil del navegador. No está cifrado, no se sincroniza y
        no modifica Notion, Sheets ni Calendar.
      </small>
    </aside>
  );
}
