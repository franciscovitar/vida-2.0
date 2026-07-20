'use client';

import { Inbox, Send } from 'lucide-react';
import { useId, useState } from 'react';

import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { inboxSeed } from '@/lib/mock-data';
import type { InboxItem } from '@/types';

import styles from './QuickInbox.module.scss';

export function QuickInbox() {
  const [items, setItems] = useState<InboxItem[]>(inboxSeed);
  const [text, setText] = useState('');
  const inputId = useId();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    const item: InboxItem = {
      id: `local-${Date.now()}`,
      text: value,
      createdAt: new Date().toISOString(),
      pendingSync: true,
    };
    setItems((prev) => [item, ...prev]);
    setText('');
  };

  return (
    <Card aria-labelledby="inbox-title">
      <SectionHeader
        id="inbox-title"
        title="Bandeja rápida"
        description="Capturá una idea o pendiente. Se sincronizará con Notion más adelante."
        icon={Inbox}
        domain="neutral"
      />
      <form className={styles.form} onSubmit={submit}>
        <label className="visually-hidden" htmlFor={inputId}>
          Nueva captura
        </label>
        <input
          id={inputId}
          className={styles.input}
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Escribí algo para no perderlo…"
          autoComplete="off"
        />
        <button
          type="submit"
          className={styles.submit}
          aria-label="Guardar captura"
          disabled={!text.trim()}
        >
          <Send size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      </form>
      {items.length > 0 ? (
        <ul className={styles.list}>
          {items.map((item) => (
            <li key={item.id} className={styles.item}>
              <span className={styles.text}>{item.text}</span>
              {item.pendingSync ? <span className={styles.pending}>Sin sincronizar</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
