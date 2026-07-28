'use client';

import { useState, useTransition } from 'react';

import { runWriteAction } from '@/app/actions/writes';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { WritesDisabledNotice } from '@/components/actions/WritePanels';
import type { InboxCapturePayload } from '@/types/actions';

import styles from './WritePanels.module.scss';

export function InboxCapturePanel({ writesEnabled }: { writesEnabled: boolean }) {
  const [text, setText] = useState('');
  const [link, setLink] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!writesEnabled) {
    return (
      <Card>
        <SectionHeader title="Captura" description="Persistencia desactivada." />
        <WritesDisabledNotice />
      </Card>
    );
  }

  return (
    <Card>
      <SectionHeader
        title="Captura persistente"
        description="Crea una propuesta. No clasifica ni convierte en tarea."
      />
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          if (!confirm) {
            setMessage('Confirmá la captura.');
            return;
          }
          const preserved = { text, link };
          const businessPayload: InboxCapturePayload = {
            text: preserved.text,
            link: preserved.link.trim() || null,
            capturedAt: new Date().toISOString(),
            origin: 'web',
          };
          start(async () => {
            const result = await runWriteAction({
              actionType: 'proposal.create',
              payload: {
                name: `Captura: ${preserved.text.trim().slice(0, 60)}`,
                proposedActionType: 'inbox.capture',
                targetType: 'inbox',
                targetKey: null,
                reason: 'Captura desde bandeja web',
                expectedChange: 'Nuevo ítem en Bandeja',
                risk: 'low',
                reversible: true,
                payload: businessPayload,
              },
              confirmation: { mode: 'explicit', acknowledged: true, phrase: null },
            });
            setMessage(result.message);
            if (result.ok) {
              setText('');
              setLink('');
              setConfirm(false);
            } else {
              setText(preserved.text);
              setLink(preserved.link);
            }
          });
        }}
      >
        <label className={styles.label}>
          Texto
          <textarea
            className={styles.input}
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            required
          />
        </label>
        <label className={styles.label}>
          Enlace HTTPS (opcional)
          <input className={styles.input} value={link} onChange={(e) => setLink(e.target.value)} />
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
          Confirmo proponer esta captura
        </label>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? 'Enviando…' : 'Proponer captura'}
        </Button>
        {message ? <p className={styles.message}>{message}</p> : null}
      </form>
    </Card>
  );
}
